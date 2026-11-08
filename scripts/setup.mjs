// npm run setup: prepares a fresh clone after `npm install`. Safe to run again;
// every run puts the programme back to the seeded talks.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

function run(note, command) {
  console.log(`\n${note}\n> ${command}`);
  try {
    execSync(command, { stdio: "inherit" });
  } catch {
    console.error(`\nSetup stopped: \`${command}\` failed.`);
    process.exit(1);
  }
}

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example.");
}

run("Applies the database migrations.", "npx prisma migrate deploy");
run("The seed deletes every talk in dev.db.", "npx prisma db seed");
run("Downloads the test browser once.", "npx playwright install chromium");

console.log("\nReady. Run npm run dev, then open http://localhost:3001.");
