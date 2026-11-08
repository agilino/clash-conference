import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { TALK_STATUS } from "../lib/constants";
import { toLocalInput } from "../lib/format";

// The two rules of the webinar task: a start lies in the future, and a room hosts
// one talk per start. Every talk here is created by this spec under a Date.now()
// title and removed after its test; all times are relative to now. Database
// checks run tests/talk-db.ts as its own tsx process (see tests/global-setup.ts).

const DESCRIPTION = "Written by tests/talk-rules.spec.ts and removed again.";
const PAST = "Start must be in the future.";
const BOOKED = "This room is already booked at that time.";

type TalkRow = { id: string; title: string; startsAt: string; room: string | null };

const created: string[] = [];

test.afterEach(() => {
  for (const id of created.splice(0)) runTalkDb(`delete ${id}`);
});

function runTalkDb(args: string, env?: Record<string, string>): string {
  return execSync(`npx tsx tests/talk-db.ts ${args}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: env ? { ...process.env, ...env } : process.env,
  });
}

function getTalk(id: string): TalkRow | null {
  return JSON.parse(runTalkDb(`get ${id}`).trim());
}

/** A start `days` from today at `hours:minutes`; negative days lie in the past. */
function startAt(days: number, hours: number, minutes: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function uniqueTitle(label: string): string {
  return `${label} ${Date.now()}`;
}

/** Inserts a draft directly, the way another organiser's talk would already sit there. */
function insertTalk(fields: { title: string; startsAt: Date; room?: string }): TalkRow {
  const row: TalkRow = JSON.parse(
    runTalkDb("create", {
      TALK_DB_CREATE: JSON.stringify({
        ...fields,
        description: DESCRIPTION,
        startsAt: fields.startsAt.toISOString(),
        status: TALK_STATUS.DRAFT,
      }),
    }).trim(),
  );
  created.push(row.id);
  return row;
}

function row(page: Page, title: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });
}

async function fillForm(page: Page, talk: { title: string; startsAt: Date; room?: string }) {
  await page.getByLabel("Title").fill(talk.title);
  await page.getByLabel("Description").fill(DESCRIPTION);
  await page.getByLabel("Starts at").fill(toLocalInput(talk.startsAt));
  await page.getByLabel("Room").fill(talk.room ?? "");
}

/** Submits /talks/new. Returns the new id when the talk was saved, else null. */
async function submitNew(
  page: Page,
  talk: { title: string; startsAt: Date; room?: string },
): Promise<string | null> {
  await page.goto("/talks/new");
  await fillForm(page, talk);
  await page.getByRole("button", { name: "Create talk" }).click();
  const saved = page.getByText("Talk created.");
  const refused = page.locator("#startsAt-error, #room-error");
  await expect(saved.or(refused).first()).toBeVisible();
  if (!(await saved.isVisible())) return null;
  const href = await row(page, talk.title)
    .getByRole("link", { name: "Edit" })
    .getAttribute("href");
  const id = href?.match(/^\/talks\/([^/]+)\/edit$/)?.[1];
  if (!id) throw new Error(`No Edit link for "${talk.title}"`);
  created.push(id);
  return id;
}

async function expectNotListed(page: Page, title: string) {
  await page.goto("/");
  await expect(row(page, title)).toHaveCount(0);
}

test("a start in the past is refused on create", async ({ page }) => {
  const title = uniqueTitle("Past talk");
  const id = await submitNew(page, { title, startsAt: startAt(-1, 10, 0) });

  expect(id).toBeNull();
  await expect(page.locator("#startsAt-error")).toHaveText(PAST);
  await expect(page.getByLabel("Starts at")).toBeFocused();
  await expectNotListed(page, title);
});

test("an edit to a start in the past is refused and changes nothing", async ({ page }) => {
  const talk = insertTalk({ title: uniqueTitle("Moved to the past"), startsAt: startAt(20, 10, 0) });

  await page.goto(`/talks/${talk.id}/edit`);
  await page.getByLabel("Starts at").fill(toLocalInput(startAt(-2, 10, 0)));
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.locator("#startsAt-error")).toHaveText(PAST);
  await expect(page.getByText("Talk saved.")).toHaveCount(0);
  expect(getTalk(talk.id)?.startsAt).toBe(talk.startsAt);
});

test("a talk in a booked room and start is refused on create", async ({ page }) => {
  const slot = startAt(21, 10, 0);
  insertTalk({ title: uniqueTitle("First in Room Q"), startsAt: slot, room: "Room Q" });
  const title = uniqueTitle("Second in Room Q");

  const id = await submitNew(page, { title, startsAt: slot, room: "Room Q" });

  expect(id).toBeNull();
  await expect(page.locator("#room-error")).toHaveText(BOOKED);
  await expect(page.getByLabel("Room")).toBeFocused();
  await expectNotListed(page, title);
});

test("an edit into a booked slot is refused and changes nothing", async ({ page }) => {
  const slot = startAt(22, 10, 0);
  insertTalk({ title: uniqueTitle("Holds the slot"), startsAt: slot, room: "Room Q" });
  const other = insertTalk({
    title: uniqueTitle("Wants the slot"),
    startsAt: startAt(22, 12, 0),
    room: "Room Q",
  });

  await page.goto(`/talks/${other.id}/edit`);
  await page.getByLabel("Starts at").fill(toLocalInput(slot));
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.locator("#room-error")).toHaveText(BOOKED);
  await expect(page.getByText("Talk saved.")).toHaveCount(0);
  expect(getTalk(other.id)?.startsAt).toBe(other.startsAt);
});

test("an edit that keeps the start and room saves", async ({ page }) => {
  const talk = insertTalk({ title: uniqueTitle("Unchanged slot"), startsAt: startAt(23, 10, 0), room: "Room Q" });

  await page.goto(`/talks/${talk.id}/edit`);
  await page.getByLabel("Title").fill(`${talk.title} (renamed)`);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Talk saved.")).toBeVisible();
  expect(getTalk(talk.id)?.title).toBe(`${talk.title} (renamed)`);
});

test("the same start in another room saves", async ({ page }) => {
  const slot = startAt(24, 10, 0);
  insertTalk({ title: uniqueTitle("In Room Q"), startsAt: slot, room: "Room Q" });

  const id = await submitNew(page, { title: uniqueTitle("In Room R"), startsAt: slot, room: "Room R" });

  expect(id).not.toBeNull();
});

test("the same start without a room saves", async ({ page }) => {
  const slot = startAt(25, 10, 0);
  insertTalk({ title: uniqueTitle("No room, first"), startsAt: slot });

  const id = await submitNew(page, { title: uniqueTitle("No room, second"), startsAt: slot });

  expect(id).not.toBeNull();
});

test("a room spelled in another case is the same room", async ({ page }) => {
  const slot = startAt(26, 10, 0);
  insertTalk({ title: uniqueTitle("In Main hall"), startsAt: slot, room: "Main hall" });
  const title = uniqueTitle("In main hall");

  const id = await submitNew(page, { title, startsAt: slot, room: "  main hall " });

  expect(id).toBeNull();
  await expect(page.locator("#room-error")).toHaveText(BOOKED);
  await expectNotListed(page, title);
});

test("one minute later in the same room saves", async ({ page }) => {
  insertTalk({ title: uniqueTitle("At ten"), startsAt: startAt(27, 10, 0), room: "Room Q" });

  const id = await submitNew(page, {
    title: uniqueTitle("At ten past one minute"),
    startsAt: startAt(27, 10, 1),
    room: "Room Q",
  });

  expect(id).not.toBeNull();
});
