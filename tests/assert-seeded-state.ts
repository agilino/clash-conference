import path from "node:path";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { TALK_STATUS } from "../lib/constants";

// Asserts the state prisma/seed.ts must leave behind. No screen reads the database
// yet, so the harness itself is what proves the seed: a dropped talk, a startsAt in
// the past or a misspelled venue name fails here instead of surfacing much later as
// a CLASH publish failure. Run by tests/global-setup.ts right after the seed.
//
// Same client setup as prisma/seed.ts — own adapter on the same file, generated
// client imported by relative path — so both move together if the seed ever
// resolves DATABASE_URL instead of process.cwd().
const dbFile = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbFile}` });
const prisma = new PrismaClient({ adapter });

const expectedSettings = {
  eventName: "CLASH Community Day",
  venueName: "Holzmarkt 25",
  hostEmail: "anna.schmidt@example.com",
};
const expectedTalks = 3;

function check(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Seeded state is wrong: ${message}`);
  }
}

async function assertSettings() {
  const settings = await prisma.settings.findMany();
  check(settings.length === 1, `${settings.length} Settings rows, expected 1`);
  const only = settings[0];
  check(
    only.eventName === expectedSettings.eventName,
    `eventName is "${only.eventName}", expected "${expectedSettings.eventName}"`,
  );
  // The venue name has to match a venue title in CLASH, so a typo here would
  // surface much later as a publish refusal.
  check(
    only.venueName === expectedSettings.venueName,
    `venueName is "${only.venueName}", expected "${expectedSettings.venueName}"`,
  );
  check(
    only.hostEmail === expectedSettings.hostEmail,
    `hostEmail is "${only.hostEmail}", expected "${expectedSettings.hostEmail}"`,
  );
}

async function assertTalks() {
  const now = new Date();
  const talks = await prisma.talk.findMany();
  check(
    talks.length === expectedTalks,
    `${talks.length} Talk rows, expected ${expectedTalks}`,
  );
  check(
    new Set(talks.map((t) => t.title)).size === talks.length,
    "two seeded talks share a title",
  );
  for (const talk of talks) {
    check(
      talk.status === TALK_STATUS.DRAFT,
      `talk "${talk.title}" has status "${talk.status}", expected "${TALK_STATUS.DRAFT}"`,
    );
    // CLASH's create_clash refuses a dateTime in the past, so a seeded talk that
    // has slipped by can never be published.
    check(
      talk.startsAt > now,
      `talk "${talk.title}" starts at ${talk.startsAt.toISOString()}, not in the future`,
    );
    check(talk.clashId === null, `talk "${talk.title}" already has a clashId`);
    check(
      talk.lastMessage === null,
      `talk "${talk.title}" already has a lastMessage`,
    );
  }
  check(
    talks.some((t) => t.room !== null),
    "no seeded talk has a room",
  );
}

// "draft" is spelled in lib/constants.ts, in prisma/schema.prisma and in the init
// migration, and nothing links the three. A row written without a status must still
// come back as TALK_STATUS.DRAFT. The probe row is removed again, so the state the
// specs see stays exactly as seeded.
async function assertStatusColumnDefault() {
  const probe = await prisma.talk.create({
    data: {
      title: "Column default probe",
      description: "Written and removed by tests/assert-seeded-state.ts.",
      startsAt: new Date(),
    },
  });
  try {
    check(
      probe.status === TALK_STATUS.DRAFT,
      `Talk.status defaults to "${probe.status}", but TALK_STATUS.DRAFT is "${TALK_STATUS.DRAFT}"`,
    );
  } finally {
    await prisma.talk.delete({ where: { id: probe.id } });
  }
}

async function main() {
  await assertSettings();
  await assertTalks();
  await assertStatusColumnDefault();
  console.log(
    `Seeded state verified: 1 settings record ("${expectedSettings.eventName}"), ${expectedTalks} future draft talks.`,
  );
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
