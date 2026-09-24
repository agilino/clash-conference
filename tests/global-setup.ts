import { execSync } from "node:child_process";

// Seed once per run so every spec starts from the known event state, then verify
// that state. The seed clears Talk and Settings first, so a repeated run is safe —
// and it deletes any programme entered by hand in the same dev.db the dev server
// serves.
//
// The check runs as its own tsx process, not as an import here: Playwright's TypeScript
// loader compiles the generated Prisma client to CommonJS and then evaluates it as an
// ES module, which fails with "exports is not defined". tsx is the runtime
// prisma/seed.ts already uses. A non-zero exit makes execSync throw and the run stop.
export default function globalSetup() {
  execSync("npm run db:seed", { stdio: "inherit" });
  execSync("npx tsx tests/assert-seeded-state.ts", { stdio: "inherit" });
}
