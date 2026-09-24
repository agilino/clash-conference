import path from "node:path";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { TALK_STATUS } from "../lib/constants";

// tsx does not apply tsconfig path aliases, so the generated client and the
// constants are imported by relative path — as ../clash/prisma/seed.ts does.
const dbFile = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbFile}` });
const prisma = new PrismaClient({ adapter });

const settings = {
  eventName: "CLASH Community Day",
  venueName: "Holzmarkt 25",
  hostEmail: "anna.schmidt@example.com",
};

// Offsets in days/hours from now, so every seeded talk always starts in the
// future: CLASH refuses a clash whose dateTime has passed.
const talks = [
  {
    title: "Opening keynote: why Berlin clashes",
    description:
      "How the CLASH community grew from a handful of hacknights into a city-wide programme, and what comes next.",
    inDays: 14,
    hour: 10,
    minute: 0,
    room: "Main hall",
  },
  {
    title: "Server Components in anger",
    description:
      "Lessons from running a Next.js App Router app in production: caching, revalidation, and the mistakes we made.",
    inDays: 14,
    hour: 11,
    minute: 30,
    room: "Workshop room",
  },
  {
    title: "Mapping a meetup",
    description:
      "Putting venues and events on a map with Leaflet and SQLite, without a hosted geo service.",
    inDays: 14,
    hour: 14,
    minute: 0,
    room: null,
  },
];

function daysFromNow(days: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  // Destructive: this is the same database the dev server reads, so a programme
  // entered by hand is gone. Said out loud because only db:reset advertises it.
  console.log(`Deleting every Talk and Settings row in ${dbFile}…`);
  await prisma.talk.deleteMany();
  await prisma.settings.deleteMany();

  console.log("Creating settings…");
  await prisma.settings.create({ data: settings });

  console.log("Creating talks…");
  for (const t of talks) {
    await prisma.talk.create({
      data: {
        title: t.title,
        description: t.description,
        startsAt: daysFromNow(t.inDays, t.hour, t.minute),
        room: t.room,
        status: TALK_STATUS.DRAFT,
      },
    });
  }

  console.log(
    `Seed complete: 1 settings record ("${settings.eventName}"), ${talks.length} draft talks.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    // An unmigrated database fails on the first deleteMany with a raw stack; name
    // the command that fixes it instead of leaving the reader there. Both wordings
    // are matched: the driver's own and Prisma's P2021.
    const missingTable =
      e instanceof Error &&
      (/no such table/i.test(e.message) ||
        /does not exist in the current database/i.test(e.message));
    if (missingTable) {
      console.error("\nThe database has no tables. Run npm run db:migrate first.");
    }
    await prisma.$disconnect();
    process.exit(1);
  });
