// guard-tests: a PreToolUse hook for Claude Code. New tests are free, committed tests need you.
//
//   Edit or Write on a new test        -> allow
//   Edit or Write on a committed test  -> first time in a session: deny, so Claude has to explain why
//                                         after that: ask you, with the diff
//   Bash or PowerShell writing there   -> block, Claude has to use Edit or Write
//
// Why deny before ask: the docs say the permission prompt shows the hook's reason,
// but in our test (Claude Code 2.1.321, Windows) it showed only the diff.
//
// When the hook cannot check something, it asks or blocks. It never lets the call through.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Folders that hold your tests, relative to the project root.
const TEST_DIRS = ["tests/"];

// Where the hook remembers which committed tests Claude was already told about.
const MARKER_DIR = process.env.GUARD_TESTS_STATE_DIR || path.join(tmpdir(), "claude-guard-tests");

const FILE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

async function main() {
  let toolCall;
  try {
    toolCall = JSON.parse(await readStdin());
  } catch {
    exitWith(block("Blocked: guard-tests could not read the tool call."));
  }

  try {
    exitWith(judgeToolCall(toolCall));
  } catch (error) {
    // Exit code 1 would let the call through, so an unexpected error blocks it.
    exitWith(block(`Blocked: guard-tests failed: ${error.message}`));
  }
}

function judgeToolCall(toolCall) {
  const root = process.env.CLAUDE_PROJECT_DIR || toolCall.cwd || process.cwd();
  const input = toolCall.tool_input ?? {};

  if (FILE_TOOLS.has(toolCall.tool_name)) {
    const file = input.file_path ?? input.notebook_path;
    return file ? judgeFileChange(root, file, toolCall.session_id) : ALLOW;
  }
  if (SHELL_TOOLS.has(toolCall.tool_name)) {
    return judgeShellCommand(root, input.command ?? "", toolCall.cwd);
  }
  return ALLOW;
}

// ---- Verdicts -------------------------------------------------------------

const ALLOW = { kind: "allow" };
const ask = (reason) => ({ kind: "ask", reason });
const deny = (reason) => ({ kind: "deny", reason });
const block = (reason) => ({ kind: "block", reason });

// Ask and deny go to Claude Code as JSON. Block is exit code 2, with the reason on stderr.
function exitWith({ kind, reason }) {
  if (kind === "ask" || kind === "deny") {
    const output = { hookEventName: "PreToolUse", permissionDecision: kind, permissionDecisionReason: reason };
    process.stdout.write(JSON.stringify({ hookSpecificOutput: output }));
  }
  if (kind === "block") console.error(reason);
  process.exit(kind === "block" ? 2 : 0);
}

// ---- Edit and Write -------------------------------------------------------

function judgeFileChange(root, file, sessionId) {
  const relPath = projectPath(root, file);
  if (relPath === null || !isInTestDir(relPath)) return ALLOW;

  const tracking = gitTracking(root, relPath);
  if (tracking === "untracked") return ALLOW; // a new test
  if (tracking === "unknown") return ask(`Could not ask git whether ${relPath} is a committed test.`);

  // Without a session id the hook cannot tell a first attempt from a second one.
  if (!sessionId) return ask(`${relPath} is a committed test.`);

  const marker = markerFile(sessionId, relPath);
  if (existsSync(marker)) return ask(`${relPath} is a committed test.`);
  if (!writeMarker(marker)) {
    return ask(`${relPath} is a committed test. The hook could not write its marker in ${MARKER_DIR}.`);
  }
  return deny(
    `${relPath} is a committed test, so changing it changes a requirement. Do not work around this. ` +
      "Tell the user which test you want to change and why, and ask whether the product rule really changed. " +
      "If they agree, make the same edit again: they will get a permission prompt to approve it.",
  );
}

// "tracked", "untracked", or "unknown" when git is missing or the project is no repository.
function gitTracking(root, relPath) {
  const result = spawnSync("git", ["ls-files", "-z", "--", relPath], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return "unknown";
  return result.stdout ? "tracked" : "untracked";
}

// One empty file per session and test. The name is a hash, so any path makes a valid file name.
function markerFile(sessionId, relPath) {
  const hash = createHash("sha256").update(`${sessionId}\n${relPath}`).digest("hex");
  return path.join(MARKER_DIR, hash);
}

function writeMarker(marker) {
  try {
    mkdirSync(MARKER_DIR, { recursive: true });
    writeFileSync(marker, "");
    return true;
  } catch {
    return false;
  }
}

// ---- Bash and PowerShell --------------------------------------------------
//
// Strict on purpose: a command that names a test folder, or runs inside one,
// and writes, moves or deletes files is blocked.

function judgeShellCommand(root, command, cwd) {
  const runsInTestDir = Boolean(cwd) && isInTestDir(projectPath(root, cwd) ?? "");
  if (!runsInTestDir && !NAMES_TEST_DIR.test(command)) return ALLOW;

  const changesFiles = FILE_CHANGING_COMMANDS.some((pattern) => pattern.test(command));
  const redirectsInTestDir =
    (runsInTestDir || ENTERS_TEST_DIR.test(command)) && REDIRECTS_TO_FILE.test(command);
  if (!changesFiles && !redirectsInTestDir) return ALLOW;

  return block(
    `Blocked: this command writes under ${TEST_DIRS.join(", ")}. ` +
      "Use the Write tool for a new test and the Edit tool for a committed one, " +
      "so the user can review changes to old tests.",
  );
}

const TEST_DIR_NAMES = TEST_DIRS.map((dir) => escapeRegExp(dir.replace(/\/$/, ""))).join("|");

// Names a test folder: "tests/x", "./tests/x", "tests\x", "C:\app\tests\x", ">tests/x", "cd tests".
const NAMES_TEST_DIR = new RegExp(`(^|[\\s"'=(:>|\\\\/])(${TEST_DIR_NAMES})([\\\\/\\s"';&|)]|$)`, "i");

// Changes into a test folder: "cd tests", "cd -- tests", "pushd ./tests", "Set-Location -Path tests".
const ENTERS_TEST_DIR = new RegExp(
  `\\b(cd|pushd|chdir|sl|Set-Location|Push-Location)\\s+(--?\\w*\\s+)*["']?[^\\s"';&|]*\\b(${TEST_DIR_NAMES})\\b`,
  "i",
);

// Redirects into a file: "> x", ">> x", ">| x". Not "2>&1", ">&2", "> /dev/null" or "> $null".
const REDIRECTS_TO_FILE = />>?\|?(?!\s*(&|\/dev\/null|\$null|nul\b))\s*["']?[^\s>]/i;

const FILE_CHANGING_COMMANDS = [
  new RegExp(`>>?\\|?\\s*["']?[^\\s"'|;&]*(${TEST_DIR_NAMES})[\\\\/]`, "i"), // redirect into a test folder
  /\bsed\b[^|;&]*\s(-[a-zA-Z]*i|--in-place)/, // sed -i, -Ei, -i.bak, --in-place
  /\bperl\b[^|;&]*\s-[a-z]*i/, // perl -i, -pi
  /\b(tee|mv|cp|rm|rmdir|touch|truncate|unlink|del|erase|move|copy|ren)\b/i,
  /\bgit(\s+(-[cC]\s+\S+|--?[\w-]+(=\S+)?))*\s+(checkout|restore|rm|mv|apply)\b/i, // also "git -C tests restore x"
  /\b(Set-Content|Add-Content|Out-File|Clear-Content|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item)\b/i,
  /\[(System\.)?IO\.File\]::/i, // the .NET file API, from PowerShell
];

// ---- Helpers --------------------------------------------------------------

// The path relative to the project root, with forward slashes. Null if it lies outside the project.
function projectPath(root, target) {
  const relPath = toSlash(path.relative(root, path.resolve(root, target)));
  return relPath.startsWith("../") || path.isAbsolute(relPath) ? null : relPath;
}

// A test folder itself, or anything inside one. Ignores case, as Windows does.
function isInTestDir(relPath) {
  const folderPath = `${relPath}/`.toLowerCase();
  return TEST_DIRS.some((dir) => folderPath.startsWith(dir.toLowerCase()));
}

function toSlash(filePath) {
  return filePath.replace(/\\/g, "/");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

await main();
