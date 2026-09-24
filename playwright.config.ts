import { defineConfig, devices } from "@playwright/test";

// One worker and no parallelism: every spec shares the single SQLite file in the
// project root, so overlapping writes would make the specs flake.
export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: "http://localhost:3001",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // reuseExistingServer attaches to an app that already holds port 3001, which may
  // be a foreign one. The url probe only proves something answers, so the identity
  // check lives in tests/app.spec.ts (the document title) and in the seeded-state
  // assertions of tests/global-setup.ts.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3001",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
