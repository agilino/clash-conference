import path from "node:path";
import { expect, test } from "@playwright/test";
// @ts-expect-error -- better-sqlite3 ships no type declarations and @types/better-sqlite3 is not a dependency.
import Database from "better-sqlite3";

// The guards of POST /api/publish (AD-8). Every case here answers before the
// agent starts, so no spec needs Agent credentials or the CLASH MCP server, and
// no spec asserts "published" (AD-15).
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
const SETTINGS_HINT =
  "Complete settings first: venue name and host email are required.";

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
  const id = `spec-publish-${Date.now()}-${counter}`;
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 30);
  db.prepare(
    `INSERT INTO "Talk" ("id", "title", "description", "startsAt", "room", "status", "clashId", "lastMessage", "createdAt")
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).run(
    id,
    `Publish spec talk ${id}`,
    "Written and removed by tests/publish.spec.ts.",
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

// Blanks one Settings field for the duration of fn, then puts the old value back.
async function withBlankSetting(
  db: Db,
  field: "venueName" | "hostEmail",
  fn: () => Promise<void>,
) {
  const settings = db.prepare(`SELECT "id", "${field}" AS value FROM "Settings"`).get();
  expect(settings, "the seed leaves one Settings row").toBeDefined();
  db.prepare(`UPDATE "Settings" SET "${field}" = '' WHERE "id" = ?`).run(settings!.id);
  try {
    await fn();
  } finally {
    db.prepare(`UPDATE "Settings" SET "${field}" = ? WHERE "id" = ?`).run(
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
  const res = await request.post("/api/publish", {
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
    const res = await request.post("/api/publish", { data });
    expect(res.status(), JSON.stringify(data)).toBe(400);
    expect(await res.json(), JSON.stringify(data)).toEqual({ error: BODY_HINT });
  }
});

test("an unknown talk is a 404", async ({ request }) => {
  const res = await request.post("/api/publish", {
    data: { talkId: "does-not-exist" },
  });
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: "Talk not found." });
});

test("an unknown talk is a 404 before the settings guard", async ({ request }) => {
  // Guard order (AD-8): the talk lookup answers before Settings are read, so
  // blank settings do not turn an unknown id into a 400.
  await withBlankSetting(db, "venueName", async () => {
    const res = await request.post("/api/publish", {
      data: { talkId: "does-not-exist" },
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Talk not found." });
  });
});

test("a published talk is a 409, stays unchanged and offers Unpublish", async ({
  request,
  page,
}) => {
  const id = insertTalk(db, {
    status: "published",
    clashId: "abc123",
    lastMessage: "Published as abc123.",
  });
  created.push(id);

  const res = await request.post("/api/publish", { data: { talkId: id } });
  expect(res.status()).toBe(409);
  expect(await res.json()).toEqual({
    error: "Talk is already published as clash abc123. Nothing was sent.",
  });
  expect(readTalk(db, id)).toEqual({
    status: "published",
    clashId: "abc123",
    lastMessage: "Published as abc123.",
  });

  // The row offers the other half of the toggle (AD-10); nothing is clicked.
  await page.goto("/");
  const row = page
    .locator("main ul > li")
    .filter({ has: page.getByText(`Publish spec talk ${id}`, { exact: true }) });
  const toggle = row.locator('[data-slot="button"]').first();
  await expect(toggle).toHaveText("Unpublish from CLASH");
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toHaveAttribute("title");
  await expect(row.getByRole("button", { name: "Publish to CLASH" })).toHaveCount(0);
});

test("a published talk with a blank venue name is a settings 400, not a 409", async ({
  request,
}) => {
  const id = insertTalk(db, {
    status: "published",
    clashId: "abc456",
    lastMessage: "Published as abc456.",
  });
  created.push(id);

  // Guard order (AD-8): the settings guard answers before the 409 check, so
  // incomplete settings win even for a published talk, and the row is untouched.
  await withBlankSetting(db, "venueName", async () => {
    const res = await request.post("/api/publish", { data: { talkId: id } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: SETTINGS_HINT });
  });
  expect(readTalk(db, id)).toEqual({
    status: "published",
    clashId: "abc456",
    lastMessage: "Published as abc456.",
  });
});

test("an empty venue name in settings is a 400 and the draft stays a draft", async ({
  request,
}) => {
  const id = insertTalk(db, { status: "draft" });
  created.push(id);

  await withBlankSetting(db, "venueName", async () => {
    const res = await request.post("/api/publish", { data: { talkId: id } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: SETTINGS_HINT });
  });
  expect(readTalk(db, id)).toEqual({
    status: "draft",
    clashId: null,
    lastMessage: null,
  });
});

test("a stored failed outcome is not a 409 and survives a settings guard", async ({
  request,
}) => {
  const lastMessage = 'No venue matches "Holzmarkt 52".';
  const id = insertTalk(db, { status: "failed", lastMessage });
  created.push(id);

  // A failed talk may be published again, so it passes the 409 guard and stops
  // at the settings guard instead, with its stored outcome untouched.
  await withBlankSetting(db, "hostEmail", async () => {
    const res = await request.post("/api/publish", { data: { talkId: id } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: SETTINGS_HINT });
  });
  expect(readTalk(db, id)).toEqual({
    status: "failed",
    clashId: null,
    lastMessage,
  });
});
