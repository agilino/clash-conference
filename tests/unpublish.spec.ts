import path from "node:path";
import { expect, test } from "@playwright/test";
// @ts-expect-error -- better-sqlite3 ships no type declarations and @types/better-sqlite3 is not a dependency.
import Database from "better-sqlite3";

// The guards of POST /api/unpublish (AD-8, the unpublish twin). Every case here
// answers before the agent starts, so no spec needs Agent credentials or the
// CLASH MCP server, and no spec asserts "unpublished" (AD-15). A published talk
// is only ever posted while the Settings host email is blank, so the settings
// guard answers first.
//
// Rows are written with raw SQL on the same dev.db the dev server reads:
// Playwright's TypeScript loader cannot evaluate the generated Prisma client
// (see tests/global-setup.ts). Each spec creates its own talks and removes them.

type Row = Record<string, unknown>;
type Db = {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Row | undefined;
  };
  close(): void;
};

const BODY_HINT = "Body must be JSON with a string talkId.";
const SETTINGS_HINT = "Complete settings first: host email is required.";
const NOT_PUBLISHED_HINT = "Talk is not published. Nothing was sent.";

function openDb(): Db {
  return new Database(path.join(process.cwd(), "dev.db")) as Db;
}

// Prisma's SQLite adapter stores DateTime as ISO text with an explicit offset.
function sqliteDate(date: Date): string {
  return date.toISOString().replace("Z", "+00:00");
}

let counter = 0;

function insertTalk(
  db: Db,
  fields: { status: string; clashId?: string | null; lastMessage?: string | null },
): string {
  counter += 1;
  const id = `spec-unpublish-${Date.now()}-${counter}`;
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 30);
  db.prepare(
    `INSERT INTO "Talk" ("id", "title", "description", "startsAt", "room", "status", "clashId", "lastMessage", "createdAt")
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).run(
    id,
    `Unpublish spec talk ${id}`,
    "Written and removed by tests/unpublish.spec.ts.",
    sqliteDate(startsAt),
    fields.status,
    fields.clashId ?? null,
    fields.lastMessage ?? null,
    sqliteDate(new Date()),
  );
  return id;
}

function readTalk(db: Db, id: string): Row | undefined {
  return db
    .prepare(`SELECT "status", "clashId", "lastMessage" FROM "Talk" WHERE "id" = ?`)
    .get(id);
}

function deleteTalk(db: Db, id: string) {
  db.prepare(`DELETE FROM "Talk" WHERE "id" = ?`).run(id);
}

// Blanks the Settings host email for the duration of fn, then puts the old
// value back.
async function withBlankHostEmail(db: Db, fn: () => Promise<void>) {
  const settings = db.prepare(`SELECT "id", "hostEmail" AS value FROM "Settings"`).get();
  expect(settings, "the seed leaves one Settings row").toBeDefined();
  db.prepare(`UPDATE "Settings" SET "hostEmail" = '' WHERE "id" = ?`).run(settings!.id);
  try {
    await fn();
  } finally {
    db.prepare(`UPDATE "Settings" SET "hostEmail" = ? WHERE "id" = ?`).run(
      settings!.value,
      settings!.id,
    );
  }
}

let db: Db;
const created: string[] = [];

test.beforeAll(() => {
  db = openDb();
});

test.afterAll(() => {
  for (const id of created) deleteTalk(db, id);
  db.close();
});

test("a body that is not JSON is a 400", async ({ request }) => {
  const res = await request.post("/api/unpublish", {
    headers: { "Content-Type": "application/json" },
    data: "not json",
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: BODY_HINT });
});

test("a body without a string talkId is a 400 with the body hint", async ({
  request,
}) => {
  for (const data of [{}, { talkId: 42 }]) {
    const res = await request.post("/api/unpublish", { data });
    expect(res.status(), JSON.stringify(data)).toBe(400);
    expect(await res.json(), JSON.stringify(data)).toEqual({ error: BODY_HINT });
  }
});

test("an unknown talk is a 404", async ({ request }) => {
  const res = await request.post("/api/unpublish", {
    data: { talkId: "does-not-exist" },
  });
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: "Talk not found." });
});

test("an unknown talk is a 404 before the settings guard", async ({ request }) => {
  // Guard order (AD-8): the talk lookup answers before Settings are read, so a
  // blank host email does not turn an unknown id into a 400.
  await withBlankHostEmail(db, async () => {
    const res = await request.post("/api/unpublish", {
      data: { talkId: "does-not-exist" },
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Talk not found." });
  });
});

test("a published talk with a blank host email is a settings 400 and stays unchanged", async ({
  request,
}) => {
  const id = insertTalk(db, {
    status: "published",
    clashId: "abc789",
    lastMessage: "Published as abc789.",
  });
  created.push(id);

  // Guard order (AD-8): the settings guard answers before the status check, so
  // the agent never starts and the row keeps its clash.
  await withBlankHostEmail(db, async () => {
    const res = await request.post("/api/unpublish", { data: { talkId: id } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: SETTINGS_HINT });
  });
  expect(readTalk(db, id)).toEqual({
    status: "published",
    clashId: "abc789",
    lastMessage: "Published as abc789.",
  });
});

test("a draft talk is a 409 and stays a draft", async ({ request }) => {
  const id = insertTalk(db, { status: "draft" });
  created.push(id);

  const res = await request.post("/api/unpublish", { data: { talkId: id } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toEqual({ error: NOT_PUBLISHED_HINT });
  expect(readTalk(db, id)).toEqual({
    status: "draft",
    clashId: null,
    lastMessage: null,
  });
});

test("a failed talk is a 409 and keeps its stored outcome", async ({ request }) => {
  const lastMessage = 'No venue matches "Holzmarkt 52".';
  const id = insertTalk(db, { status: "failed", lastMessage });
  created.push(id);

  const res = await request.post("/api/unpublish", { data: { talkId: id } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toEqual({ error: NOT_PUBLISHED_HINT });
  expect(readTalk(db, id)).toEqual({
    status: "failed",
    clashId: null,
    lastMessage,
  });
});
