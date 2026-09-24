import path from "node:path";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Resolve the SQLite file from DATABASE_URL (e.g. "file:./dev.db") relative to
// the project root, matching where the Prisma CLI creates the database.
function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = url.replace(/^file:/, "");
  if (path.isAbsolute(file)) return file;
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    file.replace(/^\.\//, ""),
  );
}

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: `file:${resolveDbPath()}` });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
