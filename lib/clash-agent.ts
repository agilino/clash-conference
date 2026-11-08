import "server-only";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// The agent seam (AD-7). With app/api/unpublish/route.ts (its self-contained
// twin, which never imports this file) it is one of the two modules that import
// the Agent SDK and read CLASH_DIR. The route hands in plain values and gets
// back one of two outcomes; this function never throws.

export type PublishInput = {
  eventName: string;
  venueName: string;
  hostEmail: string;
  title: string;
  description: string;
  startsAtIso: string;
};

export type PublishOutcome =
  | { status: "published"; clashId: string; message: string }
  | { status: "failed"; message: string };

// The one JSON line the agent must end with (PRD addendum).
const answerLineSchema = z.object({
  status: z.enum(["published", "failed"]),
  clashId: z.string().nullable(),
  message: z.string(),
});

// Every value goes through JSON.stringify, so quotes or newlines in a talk's
// text cannot break the instructions around it. The room is not sent.
function buildPrompt(input: PublishInput): string {
  const venue = JSON.stringify(input.venueName);
  return [
    `You publish one talk of the event ${JSON.stringify(input.eventName)} to CLASH.`,
    "",
    `1. Call find_venue with query ${venue}. Pick the first venue whose title equals ${venue} (case does not matter). If no venue matches, stop and answer failed.`,
    `2. Call create_clash with title ${JSON.stringify(input.title)}, description ${JSON.stringify(input.description)}, dateTime ${JSON.stringify(input.startsAtIso)}, venueId <the id from step 1>, hostEmail ${JSON.stringify(input.hostEmail)}.`,
    "3. Answer with exactly one line of JSON and nothing else:",
    '   {"status":"published","clashId":"<id from create_clash>","message":"<one short sentence>"}',
    "   or",
    '   {"status":"failed","clashId":null,"message":"<the tool\'s refusal text or the reason>"}',
    "",
    "Never create a venue or a user. Never guess an id. Do not call any other tool.",
  ].join("\n");
}

// Scan from the last line upward and take the first line that is a valid
// Answer line. Survives a code fence or a closing remark after the JSON.
function parseAnswer(result: string): PublishOutcome {
  const lines = result.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const answer = answerLineSchema.safeParse(json);
    if (!answer.success) continue;
    const { status, clashId, message } = answer.data;
    if (status === "failed") return { status: "failed", message };
    if (!clashId || !clashId.trim()) {
      return {
        status: "failed",
        message: "Agent reported published without a clashId",
      };
    }
    return { status: "published", clashId: clashId.trim(), message };
  }
  return {
    status: "failed",
    message: "Agent gave no JSON answer: " + result.slice(0, 200),
  };
}

export async function publishTalkToClash(
  input: PublishInput,
): Promise<PublishOutcome> {
  const clashDir = process.env.CLASH_DIR ?? "../clash";
  try {
    // The agent is fully isolated: it sees the two CLASH tools and nothing of
    // the developer's machine, so its behaviour and language come from the
    // prompt alone, on every machine that runs this app.
    const run = query({
      prompt: buildPrompt(input),
      options: {
        mcpServers: {
          clash: { command: "npx", args: ["tsx", clashDir + "/mcp/server.ts"] },
        },
        tools: [], // no built-in tools
        settingSources: [], // no ~/.claude, no .claude/, no CLAUDE.md
        strictMcpConfig: true, // only the clash server
        allowedTools: ["mcp__clash__find_venue", "mcp__clash__create_clash"],
        permissionMode: "dontAsk", // every other call is denied, never prompted
        maxTurns: 8,
      },
    });

    for await (const message of run) {
      if (message.type === "system" && message.subtype === "init") {
        // FR-9: a server that did not come up ends the run here; leaving the
        // loop closes the query, so nothing waits for an answer.
        const clash = message.mcp_servers.find((s) => s.name === "clash");
        if (!clash) {
          return { status: "failed", message: "CLASH MCP server not started" };
        }
        if (clash.status === "failed" || clash.status === "needs-auth") {
          return {
            status: "failed",
            message: "CLASH MCP server status: " + clash.status,
          };
        }
        continue;
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          if (message.is_error) {
            return { status: "failed", message: message.result };
          }
          return parseAnswer(message.result);
        }
        return {
          status: "failed",
          message: message.errors?.join("; ") || message.subtype,
        };
      }
    }

    return { status: "failed", message: "Agent run ended without a result" };
  } catch (error) {
    // No credentials, a spawn failure, anything the SDK throws: a failed
    // outcome, never a 500.
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
