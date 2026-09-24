import { expect, test } from "@playwright/test";

test("the talks list is the start page", async ({ page }) => {
  await page.goto("/");
  // Identity marker first. `reuseExistingServer: true` lets Playwright attach to
  // whatever already serves port 3001, and an h1 "Talks" alone would pass against
  // a foreign app. The document title comes from app/layout.tsx's metadata, which
  // no later story rewrites — unlike the header link ("clash-conference" becomes
  // the event name in Story 2.1) or the empty state (the talks list replaces it in
  // Story 2.3).
  await expect(page).toHaveTitle("clash-conference");
  await expect(
    page.getByRole("heading", { level: 1, name: "Talks" }),
  ).toBeVisible();
});
