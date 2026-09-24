import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// The global setup seeds once before the run, so the single Settings row holds
// the seeded event. The saving test writes the seed values back, so the record
// ends as seeded whatever order these tests run in.
const SEEDED = {
  eventName: "CLASH Community Day",
  venueName: "Holzmarkt 25",
  hostEmail: "anna.schmidt@example.com",
};

test("the settings form is pre-filled from the one record", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveTitle("Settings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible();

  await expect(page.getByLabel("Event name")).toHaveValue(SEEDED.eventName);
  await expect(page.getByLabel("CLASH venue name")).toHaveValue(
    SEEDED.venueName,
  );
  await expect(page.getByLabel("Host email")).toHaveValue(SEEDED.hostEmail);

  await expect(
    page.getByRole("banner").getByRole("link", { name: SEEDED.eventName }),
  ).toBeVisible();

  // Both hints are shown and linked to their input, so a screen reader reads
  // them with the field.
  await expect(
    page.getByText("Must equal a venue title in CLASH, for example Holzmarkt 25."),
  ).toBeVisible();
  await expect(page.getByLabel("CLASH venue name")).toHaveAttribute(
    "aria-describedby",
    "venueName-hint",
  );
  await expect(
    page.getByText(
      "A CLASH user's email, for example anna.schmidt@example.com.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Host email")).toHaveAttribute(
    "aria-describedby",
    "hostEmail-hint",
  );
});

test("the Settings nav link is marked as the current page", async ({ page }) => {
  await page.goto("/settings");
  const nav = page.getByRole("banner");
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveClass(
    /(^|\s)text-foreground(\s|$)/,
  );
  await expect(nav.getByRole("link", { name: "Talks" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Talks" })).toHaveClass(
    /(^|\s)text-muted-foreground(\s|$)/,
  );
});

test("an invalid host email shows a field error and saves nothing", async ({
  page,
}) => {
  await page.goto("/settings");
  const email = page.getByLabel("Host email");
  await email.fill("not-an-email");
  await page.getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  // The error replaces the hint and takes over the description.
  await expect(email).toHaveAttribute("aria-describedby", "hostEmail-error");
  await expect(
    page.getByText(
      "A CLASH user's email, for example anna.schmidt@example.com.",
    ),
  ).toHaveCount(0);
  await expect(email).toBeFocused();
  await expect(page.getByText("Settings saved.")).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);

  // Nothing was written: a reload brings the seeded address back.
  await page.reload();
  await expect(page.getByLabel("Host email")).toHaveValue(SEEDED.hostEmail);
});

test("an empty event name shows a field error and saves nothing", async ({
  page,
}) => {
  await page.goto("/settings");
  const eventName = page.getByLabel("Event name");
  await eventName.fill("");
  await page.getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByText("Event name is required.")).toBeVisible();
  await expect(eventName).toHaveAttribute("aria-invalid", "true");
  await expect(eventName).toBeFocused();
  await expect(page.getByText("Settings saved.")).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("Event name")).toHaveValue(SEEDED.eventName);
});

test("saving a new event name toasts, returns to the list and updates the header", async ({
  page,
}) => {
  const renamed = "CLASH Community Day (renamed by the settings spec)";
  await page.goto("/settings");
  await page.getByLabel("Event name").fill(renamed);
  await page.getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("banner").getByRole("link", { name: renamed }),
  ).toBeVisible();

  // Still one record, holding the new name beside the untouched other fields.
  await page.goto("/settings");
  await expect(page.getByLabel("Event name")).toHaveValue(renamed);
  await expect(page.getByLabel("CLASH venue name")).toHaveValue(
    SEEDED.venueName,
  );
  await expect(page.getByLabel("Host email")).toHaveValue(SEEDED.hostEmail);

  // Leave the record as the seed left it.
  await page.getByLabel("Event name").fill(SEEDED.eventName);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("banner").getByRole("link", { name: SEEDED.eventName }),
  ).toBeVisible();

  // Two saves later the table still holds exactly one Settings row. The check
  // runs as its own tsx process for the reason tests/global-setup.ts gives.
  execSync("npx tsx tests/assert-one-settings-row.ts", { stdio: "inherit" });
});
