import { execSync } from "node:child_process";

// Seed once per run so every spec starts from the known event state. The seed
// clears Talk and Settings first, so running it repeatedly is safe.
export default function globalSetup() {
  execSync("npm run db:seed", { stdio: "inherit" });
}
