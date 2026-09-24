import { expect, test } from "@playwright/test";

test("the talks list is the start page", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Talks" }),
  ).toBeVisible();
});
