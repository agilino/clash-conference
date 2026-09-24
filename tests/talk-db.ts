import path from "node:path";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { asTalkStatus, type TalkStatus } from "../lib/constants";

// Reads, patches, inserts or removes Talk rows for tests/talks.spec.ts. Runs as
// its own tsx process for the reason tests/global-setup.ts gives. Same client
// setup as tests/assert-one-settings-row.ts.
//
//   npx tsx tests/talk-db.ts get <id>      prints the row as JSON, or null
//   npx tsx tests/talk-db.ts set <id>      applies the JSON patch in TALK_DB_PATCH;
//                                          only status, clashId and lastMessage
//   npx tsx tests/talk-db.ts delete <id>   removes the row, if it still exists
//   npx tsx tests/talk-db.ts create        inserts the JSON row in TALK_DB_CREATE
//                                          (title, description, startsAt as ISO,
//                                          optional room, status, clashId,
//                                          lastMessage); prints it as JSON
//   npx tsx tests/talk-db.ts delete-all    removes every row; the caller reseeds
//
// A patch or a row travels through an environment variable, never through an
// argument: quoting JSON on a command line differs between cmd.exe and POSIX
// shells.
const dbFile = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbFile}` });
const prisma = new PrismaClient({ adapter });

type Patch = {
  status?: TalkStatus;
  clashId?: string | null;
  lastMessage?: string | null;
};

function readJsonObject(variable: string): Record<string, unknown> {
  const raw = process.env[variable];
  if (!raw) throw new Error(`${variable} is not set`);
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${variable} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function readPatch(): Patch {
  const parsed = readJsonObject("TALK_DB_PATCH");
  const patch: Patch = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== null && typeof value !== "string") {
      throw new Error(`TALK_DB_PATCH.${key} must be a string or null`);
    }
    if (key === "status") {
      if (value === null) throw new Error("TALK_DB_PATCH.status cannot be null");
      patch.status = asTalkStatus(value);
    } else if (key === "clashId") {
      patch.clashId = value;
    } else if (key === "lastMessage") {
      patch.lastMessage = value;
    } else {
      throw new Error(
        `TALK_DB_PATCH may set status, clashId and lastMessage only, not "${key}"`,
      );
    }
  }
  return patch;
}

type Row = {
  title: string;
  description: string;
  startsAt: Date;
  room: string | null;
  status?: TalkStatus;
  clashId: string | null;
  lastMessage: string | null;
};

const ROW_KEYS = [
  "title",
  "description",
  "startsAt",
  "room",
  "status",
  "clashId",
  "lastMessage",
];

function requireString(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  if (typeof value !== "string") {
    throw new Error(`TALK_DB_CREATE.${key} must be a string`);
  }
  return value;
}

function optionalString(
  fields: Record<string, unknown>,
  key: string,
): string | null {
  const value = fields[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`TALK_DB_CREATE.${key} must be a string or null`);
  }
  return value;
}

// The row as the publish route will write it: status, clashId and lastMessage
// included, so a spec can show a failed or a published talk without CLASH.
function readRow(): Row {
  const fields = readJsonObject("TALK_DB_CREATE");
  for (const key of Object.keys(fields)) {
    if (!ROW_KEYS.includes(key)) {
      throw new Error(
        `TALK_DB_CREATE may set ${ROW_KEYS.join(", ")} only, not "${key}"`,
      );
    }
  }
  const startsAt = new Date(requireString(fields, "startsAt"));
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("TALK_DB_CREATE.startsAt must be an ISO date-time");
  }
  return {
    title: requireString(fields, "title"),
    description: requireString(fields, "description"),
    startsAt,
    room: optionalString(fields, "room"),
    // Absent: the column default applies.
    status:
      fields.status === undefined
        ? undefined
        : asTalkStatus(requireString(fields, "status")),
    clashId: optionalString(fields, "clashId"),
    lastMessage: optionalString(fields, "lastMessage"),
  };
}

function requireId(id: string | undefined, command: string): string {
  if (!id) throw new Error(`usage: npx tsx tests/talk-db.ts ${command} <id>`);
  return id;
}

async function main() {
  const [command, id] = process.argv.slice(2);
  switch (command) {
    case "get": {
      const talk = await prisma.talk.findUnique({
        where: { id: requireId(id, command) },
      });
      console.log(JSON.stringify(talk));
      return;
    }
    case "set": {
      await prisma.talk.update({
        where: { id: requireId(id, command) },
        data: readPatch(),
      });
      return;
    }
    case "delete": {
      // deleteMany, not delete: the cleanup after a test must not fail when the
      // test already removed its talk through the UI.
      await prisma.talk.deleteMany({ where: { id: requireId(id, command) } });
      return;
    }
    case "create": {
      const talk = await prisma.talk.create({ data: readRow() });
      console.log(JSON.stringify(talk));
      return;
    }
    case "delete-all": {
      await prisma.talk.deleteMany();
      return;
    }
    default:
      throw new Error(
        `Unknown command "${command}": expected get, set, delete, create or delete-all`,
      );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
