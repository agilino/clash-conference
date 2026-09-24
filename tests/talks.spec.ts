import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { TALK_STATUS } from "../lib/constants";
import { toLocalInput } from "../lib/format";

// Every talk here is created by the spec itself, under a title with a Date.now()
// suffix, and removed again after its test — so nothing depends on the seeded
// talks and the programme ends as seeded. A talk's id is read from its row's
// Edit link. The database checks run tests/talk-db.ts as its own tsx process,
// for the reason tests/global-setup.ts gives.

type TalkRow = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  room: string | null;
  status: string;
  clashId: string | null;
  lastMessage: string | null;
  createdAt: string;
};

const DESCRIPTION = "Written by tests/talks.spec.ts and removed again.";

/** A start `days` out at `hours:minutes`, typed the way the datetime-local input wants it. */
function localStart(days: number, hours: number, minutes: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return toLocalInput(d);
}

// 30 days out. The stored instant must equal this local time read on the same
// machine.
const FUTURE_START = localStart(30, 10, 30);
// 45 days out, for the edit that changes every field.
const LATER_START = localStart(45, 14, 0);

/** ids of the talks the current test created; drained by afterEach. */
const created: string[] = [];

test.afterEach(() => {
  for (const id of created.splice(0)) talkDb("delete", id);
});

function talkDb(
  command: "get" | "set" | "delete",
  id: string,
  patch?: Partial<Record<"status" | "clashId" | "lastMessage", string | null>>,
): string {
  return execSync(`npx tsx tests/talk-db.ts ${command} ${id}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: patch
      ? { ...process.env, TALK_DB_PATCH: JSON.stringify(patch) }
      : process.env,
  });
}

function getTalk(id: string): TalkRow | null {
  return JSON.parse(talkDb("get", id).trim());
}

function uniqueTitle(label: string): string {
  return `${label} ${Date.now()}`;
}

/** The interim list row that shows exactly this title. */
function row(page: Page, title: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });
}

/** Creates a talk through /talks/new and returns its id, read from the row. */
async function createTalk(
  page: Page,
  talk: { title: string; startsAt: string; room?: string },
): Promise<string> {
  await page.goto("/talks/new");
  await page.getByLabel("Title").fill(talk.title);
  await page.getByLabel("Description").fill(DESCRIPTION);
  await page.getByLabel("Starts at").fill(talk.startsAt);
  if (talk.room) await page.getByLabel("Room").fill(talk.room);
  await page.getByRole("button", { name: "Create talk" }).click();

  await expect(page.getByText("Talk created.")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  const href = await row(page, talk.title)
    .getByRole("link", { name: "Edit" })
    .getAttribute("href");
  const id = href?.match(/^\/talks\/([^/]+)\/edit$/)?.[1];
  if (!id) throw new Error(`No Edit link for "${talk.title}" (href ${href})`);
  created.push(id);
  return id;
}

test("the Talks nav link is current on the talk screens", async ({ page }) => {
  await page.goto("/");
  // The header's button (the empty state carries the same one while no talk exists).
  await page.getByRole("link", { name: "New talk" }).first().click();
  await expect(page).toHaveURL(/\/talks\/new$/);
  await expect(page).toHaveTitle("New talk");
  await expect(
    page.getByRole("heading", { level: 1, name: "New talk" }),
  ).toBeVisible();

  const nav = page.getByRole("banner");
  await expect(nav.getByRole("link", { name: "Talks" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Talks" })).toHaveClass(
    /(^|\s)text-foreground(\s|$)/,
  );
  await expect(nav.getByRole("link", { name: "Settings" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveClass(
    /(^|\s)text-muted-foreground(\s|$)/,
  );
});

test("an empty description shows a field error and saves nothing", async ({
  page,
}) => {
  const title = uniqueTitle("Unsaved talk");
  await page.goto("/talks/new");
  // Create mode autofocuses the title.
  await expect(page.getByLabel("Title")).toBeFocused();
  await expect(page.getByLabel("Room")).toHaveAttribute(
    "aria-describedby",
    "room-hint",
  );
  await expect(page.getByText("Optional", { exact: true })).toBeVisible();

  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Starts at").fill(FUTURE_START);
  await page.getByRole("button", { name: "Create talk" }).click();

  const description = page.getByLabel("Description");
  await expect(page.getByText("Description is required.")).toBeVisible();
  await expect(description).toHaveAttribute("aria-invalid", "true");
  await expect(description).toHaveAttribute(
    "aria-describedby",
    "description-error",
  );
  await expect(description).toBeFocused();
  // React resets uncontrolled inputs after the action returns; the typed text
  // must survive that reset.
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await expect(page.getByLabel("Starts at")).toHaveValue(FUTURE_START);
  await expect(page.getByText("Talk created.")).toHaveCount(0);
  await expect(page).toHaveURL(/\/talks\/new$/);

  // Nothing was written: the list has no such row.
  await page.goto("/");
  await expect(row(page, title)).toHaveCount(0);
});

test("an empty start shows a field error and saves nothing", async ({
  page,
}) => {
  const title = uniqueTitle("Undated talk");
  await page.goto("/talks/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill(DESCRIPTION);
  await page.getByRole("button", { name: "Create talk" }).click();

  const startsAt = page.getByLabel("Starts at");
  await expect(page.getByText("Enter a valid date and time.")).toBeVisible();
  await expect(startsAt).toHaveAttribute("aria-invalid", "true");
  await expect(startsAt).toHaveAttribute("aria-describedby", "startsAt-error");
  await expect(startsAt).toBeFocused();
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await expect(page.getByLabel("Description")).toHaveValue(DESCRIPTION);
  await expect(page.getByText("Talk created.")).toHaveCount(0);
  await expect(page).toHaveURL(/\/talks\/new$/);

  await page.goto("/");
  await expect(row(page, title)).toHaveCount(0);
});

test("creating a talk toasts, returns to the list and stores a draft", async ({
  page,
}) => {
  const title = uniqueTitle("Created talk");
  const id = await createTalk(page, {
    title,
    startsAt: FUTURE_START,
    room: "Room Z",
  });
  await expect(row(page, title)).toBeVisible();

  const talk = getTalk(id);
  expect(talk).not.toBeNull();
  expect(talk?.title).toBe(title);
  expect(talk?.description).toBe(DESCRIPTION);
  expect(talk?.room).toBe("Room Z");
  expect(talk?.status).toBe(TALK_STATUS.DRAFT);
  expect(talk?.clashId).toBeNull();
  expect(talk?.lastMessage).toBeNull();
  expect(Number.isNaN(new Date(talk?.createdAt ?? "").getTime())).toBe(false);
  // The local time typed into the input, stored as an absolute instant.
  expect(talk?.startsAt).toBe(new Date(FUTURE_START).toISOString());
});

test("a start in the past is accepted", async ({ page }) => {
  const title = uniqueTitle("Past talk");
  const past = "2020-01-01T09:00";
  const id = await createTalk(page, { title, startsAt: past });
  await expect(row(page, title)).toBeVisible();
  // Earliest start first: 2020 sorts before every seeded (14 days out) and
  // created (30 days out) talk. The list's own <li>s, not every listitem on
  // the page — sonner renders its toasts as <li> too.
  await expect(page.locator("main ul > li").first()).toContainText(title);

  const talk = getTalk(id);
  expect(talk?.startsAt).toBe(new Date(past).toISOString());
  // Created without a room.
  expect(talk?.room).toBeNull();
});

// Editing changes the four form fields only, whatever the publish route wrote
// into the other three columns.
for (const variant of [
  {
    status: TALK_STATUS.PUBLISHED,
    patch: { status: TALK_STATUS.PUBLISHED, clashId: "clash-set-by-the-talks-spec" },
    notice: true,
    // Every column the form owns changes.
    edit: {
      description: `${DESCRIPTION} Edited.`,
      startsAt: LATER_START,
      room: "Room Y",
    },
    storedRoom: "Room Y",
  },
  {
    status: TALK_STATUS.FAILED,
    patch: {
      status: TALK_STATUS.FAILED,
      lastMessage: "Venue 'Nowhere' was not found in CLASH.",
    },
    notice: false,
    // The room is cleared: a blank room is stored as null, never as "".
    edit: { description: DESCRIPTION, startsAt: FUTURE_START, room: "" },
    storedRoom: null,
  },
]) {
  test(`editing a ${variant.status} talk saves the fields and leaves its status alone`, async ({
    page,
  }) => {
    const title = uniqueTitle(`Editable ${variant.status} talk`);
    const id = await createTalk(page, {
      title,
      startsAt: FUTURE_START,
      room: "Room Z",
    });
    talkDb("set", id, variant.patch);

    await row(page, title).getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(new RegExp(`/talks/${id}/edit$`));
    await expect(page).toHaveTitle("Edit talk");
    await expect(
      page.getByRole("heading", { level: 1, name: "Edit talk" }),
    ).toBeVisible();

    const nav = page.getByRole("banner");
    await expect(nav.getByRole("link", { name: "Talks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Settings" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );

    // Prefilled from the row, the start in local time.
    await expect(page.getByLabel("Title")).toHaveValue(title);
    await expect(page.getByLabel("Description")).toHaveValue(DESCRIPTION);
    await expect(page.getByLabel("Starts at")).toHaveValue(FUTURE_START);
    await expect(page.getByLabel("Room")).toHaveValue("Room Z");
    await expect(
      page.getByText(
        "Editing changes this list only. The clash in CLASH is not updated.",
      ),
    ).toHaveCount(variant.notice ? 1 : 0);

    const renamed = `${title} (renamed)`;
    await page.getByLabel("Title").fill(renamed);
    await page.getByLabel("Description").fill(variant.edit.description);
    await page.getByLabel("Starts at").fill(variant.edit.startsAt);
    await page.getByLabel("Room").fill(variant.edit.room);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Talk saved.")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(row(page, renamed)).toBeVisible();
    await expect(row(page, title)).toHaveCount(0);

    const talk = getTalk(id);
    expect(talk?.title).toBe(renamed);
    expect(talk?.description).toBe(variant.edit.description);
    expect(talk?.startsAt).toBe(new Date(variant.edit.startsAt).toISOString());
    expect(talk?.room).toBe(variant.storedRoom);
    expect(talk?.status).toBe(variant.status);
    expect(talk?.clashId).toBe(variant.patch.clashId ?? null);
    expect(talk?.lastMessage).toBe(variant.patch.lastMessage ?? null);
  });
}

test("an edit that misses validation keeps the other typed values", async ({
  page,
}) => {
  const title = uniqueTitle("Unrenamed talk");
  const id = await createTalk(page, { title, startsAt: FUTURE_START });

  await row(page, title).getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(new RegExp(`/talks/${id}/edit$`));
  const edited = `${DESCRIPTION} Edited.`;
  await page.getByLabel("Title").fill("");
  await page.getByLabel("Description").fill(edited);
  await page.getByRole("button", { name: "Save changes" }).click();

  const titleInput = page.getByLabel("Title");
  await expect(page.getByText("Title is required.")).toBeVisible();
  await expect(titleInput).toHaveAttribute("aria-invalid", "true");
  await expect(titleInput).toBeFocused();
  // The typed values survive React's post-action reset; the saved description
  // does not come back.
  await expect(page.getByLabel("Description")).toHaveValue(edited);
  await expect(page.getByLabel("Starts at")).toHaveValue(FUTURE_START);
  await expect(page.getByText("Talk saved.")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/talks/${id}/edit$`));
  expect(getTalk(id)?.title).toBe(title);
});

test("saving a talk that vanished meanwhile toasts and keeps the typed text", async ({
  page,
}) => {
  const title = uniqueTitle("Vanished draft");
  const id = await createTalk(page, { title, startsAt: FUTURE_START });

  await row(page, title).getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(new RegExp(`/talks/${id}/edit$`));
  const renamed = `${title} (renamed)`;
  await page.getByLabel("Title").fill(renamed);
  // The row goes away under the open form (another tab, say).
  talkDb("delete", id);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Talk not found.")).toBeVisible();
  await expect(page.getByText("Talk saved.")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/talks/${id}/edit$`));
  // The action hands the typed text back, so the reset keeps it under the toast.
  await expect(page.getByLabel("Title")).toHaveValue(renamed);
  expect(getTalk(id)).toBeNull();
});

test("an unknown talk id renders the 404 page", async ({ page }) => {
  const response = await page.goto("/talks/does-not-exist/edit");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("cancelling the delete dialog keeps the talk and returns focus", async ({
  page,
}) => {
  const title = uniqueTitle("Kept talk");
  const id = await createTalk(page, { title, startsAt: FUTURE_START });

  const trigger = row(page, title).getByRole("button", {
    name: `Delete ${title}`,
  });
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this talk?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      `“${title}” will be removed from this list. If it was published, the clash in CLASH stays. This can't be undone.`,
    ),
  ).toBeVisible();
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeFocused();
  await cancel.click();

  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(row(page, title)).toBeVisible();
  await expect(page.getByText("Talk deleted.")).toHaveCount(0);
  expect(getTalk(id)).not.toBeNull();
});

test("confirming the delete dialog removes the talk", async ({ page }) => {
  const title = uniqueTitle("Deleted talk");
  const id = await createTalk(page, { title, startsAt: FUTURE_START });

  await row(page, title)
    .getByRole("button", { name: `Delete ${title}` })
    .click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this talk?" });
  await dialog.getByRole("button", { name: "Delete talk" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Talk deleted.")).toBeVisible();
  await expect(row(page, title)).toHaveCount(0);
  // The trigger went with the row, so the dialog handed focus to the page
  // heading instead of letting it fall to <body>.
  await expect(
    page.getByRole("heading", { level: 1, name: "Talks" }),
  ).toBeFocused();
  expect(getTalk(id)).toBeNull();

  await page.reload();
  await expect(row(page, title)).toHaveCount(0);
});

test("a delete that fails closes the dialog and toasts the error", async ({
  page,
}) => {
  const title = uniqueTitle("Vanished talk");
  const id = await createTalk(page, { title, startsAt: FUTURE_START });

  await row(page, title)
    .getByRole("button", { name: `Delete ${title}` })
    .click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this talk?" });
  await expect(dialog).toBeVisible();
  // The row goes away behind the open dialog (another tab, say), so the
  // action's delete throws.
  talkDb("delete", id);
  await dialog.getByRole("button", { name: "Delete talk" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Could not delete this talk.")).toBeVisible();
  await expect(page.getByText("Talk deleted.")).toHaveCount(0);
  // The list refreshes on this outcome too: no dead row stays behind, and
  // focus moves to the heading because the trigger went with the row.
  await expect(row(page, title)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "Talks" }),
  ).toBeFocused();
});
