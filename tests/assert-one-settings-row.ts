import path from "node:path";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Asserts that the Settings table holds exactly one row. Run by tests/settings.spec.ts
// after a save, as its own tsx process for the reason tests/global-setup.ts gives.
// Checks nothing about talks, so later stories' specs can change the programme freely.
// Same client setup as tests/assert-seeded-state.ts.
const dbFile = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbFile}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.settings.count();
  if (rows !== 1) {
    throw new Error(`${rows} Settings rows, expected exactly 1`);
  }
  console.log("Settings holds exactly one row.");
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
