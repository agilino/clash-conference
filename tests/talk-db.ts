import path from "node:path";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { asTalkStatus } from "../lib/constants";

// Reads, patches or removes one Talk row for tests/talks.spec.ts. Runs as its own
// tsx process for the reason tests/global-setup.ts gives. Same client setup as
// tests/assert-one-settings-row.ts.
//
//   npx tsx tests/talk-db.ts get <id>      prints the row as JSON, or null
//   npx tsx tests/talk-db.ts set <id>      applies the JSON patch in TALK_DB_PATCH;
//                                          only status, clashId and lastMessage
//   npx tsx tests/talk-db.ts delete <id>   removes the row, if it still exists
//
// The patch travels through an environment variable, never through an argument:
// quoting JSON on a command line differs between cmd.exe and POSIX shells.
const dbFile = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbFile}` });
const prisma = new PrismaClient({ adapter });

type Patch = {
  status?: string;
  clashId?: string | null;
  lastMessage?: string | null;
};

function readPatch(): Patch {
  const raw = process.env.TALK_DB_PATCH;
  if (!raw) throw new Error("TALK_DB_PATCH is not set");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("TALK_DB_PATCH must be a JSON object");
  }
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

async function main() {
  const [command, id] = process.argv.slice(2);
  if (!id) {
    throw new Error("usage: npx tsx tests/talk-db.ts <get|set|delete> <id>");
  }
  switch (command) {
    case "get": {
      const talk = await prisma.talk.findUnique({ where: { id } });
      console.log(JSON.stringify(talk));
      return;
    }
    case "set": {
      await prisma.talk.update({ where: { id }, data: readPatch() });
      return;
    }
    case "delete": {
      // deleteMany, not delete: the cleanup after a test must not fail when the
      // test already removed its talk through the UI.
      await prisma.talk.deleteMany({ where: { id } });
      return;
    }
    default:
      throw new Error(`Unknown command "${command}": expected get, set or delete`);
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
