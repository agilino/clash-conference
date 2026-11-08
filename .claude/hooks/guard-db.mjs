// PreToolUse hook for Bash and PowerShell. The tool call arrives as JSON on
// stdin; exit code 2 blocks it and stderr tells Claude why. It guards dev.db:
// setup, seed and reset delete every talk, and so does removing the file.
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  const command = JSON.parse(raw || "{}").tool_input?.command ?? "";
  const wipesTalks =
    /\bnpm\s+run\s+(setup|db:seed|db:reset)\b/.test(command) ||
    /\bprisma\s+(db\s+seed|migrate\s+reset)\b/.test(command) ||
    /\b(rm|del|Remove-Item)\b.*dev\.db/i.test(command);
  if (wipesTalks) {
    console.error("Blocked: this deletes every talk in dev.db. Ask the user to run it.");
    process.exit(2);
  }
});
