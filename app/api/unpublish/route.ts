import "server-only";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { TALK_STATUS } from "@/lib/constants";
import { getSettings } from "@/lib/data/settings";
import type { Settings, Talk } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// POST /api/unpublish { talkId } — the twin of the publish route (AD-7, AD-8).
// Self-contained on purpose: it holds its own query() call and never imports
// lib/clash-agent.ts, so it stays on 19-start as the worked example of the
// publish route. Beside that route it is the only writer of status, clashId and
// lastMessage (AD-2). Every guard answers before the agent starts; Talk and
// Settings are read once, so edits made while the agent runs never reach it.

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function serverError(error: unknown): Response {
  console.error("POST /api/unpublish failed:", error);
  return fail(500, error instanceof Error ? error.message : String(error));
}

function talkBody(talk: Pick<Talk, "id" | "status" | "clashId" | "lastMessage">) {
  return {
    talk: {
      id: talk.id,
      status: talk.status,
      clashId: talk.clashId,
      lastMessage: talk.lastMessage,
    },
  };
}

async function readTalkId(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) return null;
    const { talkId } = body as { talkId?: unknown };
    return typeof talkId === "string" ? talkId : null;
  } catch {
    return null;
  }
}

type Guarded = { talk: Talk; settings: Settings } | { response: Response };

async function loadAndGuard(talkId: string): Promise<Guarded> {
  const talk = await prisma.talk.findUnique({ where: { id: talkId } });
  if (!talk) return { response: fail(404, "Talk not found.") };

  const settings = await getSettings();
  if (!settings || !settings.hostEmail.trim()) {
    return {
      response: fail(400, "Complete settings first: host email is required."),
    };
  }

  if (talk.status !== TALK_STATUS.PUBLISHED) {
    return { response: fail(409, "Talk is not published. Nothing was sent.") };
  }

  return { talk, settings };
}

// ---- The agent run: the seam's structure, for cancel_clash only ------------

type UnpublishOutcome = { status: "unpublished" | "failed"; message: string };

// The one JSON line the agent must end with (PRD addendum). It carries no
// clashId: the route keeps the stored one on failure and clears it on success.
const answerLineSchema = z.object({
  status: z.enum(["unpublished", "failed"]),
  message: z.string(),
});

// Both values go through JSON.stringify, so quotes or newlines cannot break the
// instructions around them.
function buildPrompt(clashId: string | null, hostEmail: string): string {
  return [
    "You unpublish one talk from CLASH by cancelling its clash.",
    "",
    `1. Call cancel_clash with clashId ${JSON.stringify(clashId)} and hostEmail ${JSON.stringify(hostEmail)}.`,
    "2. Answer with exactly one line of JSON and nothing else:",
    '   {"status":"unpublished","message":"<the cancel_clash reply, verbatim>"}',
    "   or",
    '   {"status":"failed","message":"<the tool\'s refusal text or the reason>"}',
    "",
    "Never call any other tool. Never guess an id.",
  ].join("\n");
}

// Scan from the last line upward and take the first line that is a valid
// Answer line. Survives a code fence or a closing remark after the JSON.
function parseAnswer(result: string): UnpublishOutcome {
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
    return { status: answer.data.status, message: answer.data.message };
  }
  return {
    status: "failed",
    message: "Agent gave no JSON answer: " + result.slice(0, 200),
  };
}

// Never throws: every way the run can end is one of the two outcomes.
async function cancelClash(
  clashId: string | null,
  hostEmail: string,
): Promise<UnpublishOutcome> {
  const clashDir = process.env.CLASH_DIR ?? "../clash";
  try {
    // The agent is fully isolated: it sees cancel_clash and nothing of the
    // developer's machine, so its behaviour and language come from the prompt
    // alone, on every machine that runs this app.
    const run = query({
      prompt: buildPrompt(clashId, hostEmail),
      options: {
        mcpServers: {
          clash: { command: "npx", args: ["tsx", clashDir + "/mcp/server.ts"] },
        },
        tools: [], // no built-in tools
        settingSources: [], // no ~/.claude, no .claude/, no CLAUDE.md
        strictMcpConfig: true, // only the clash server
        allowedTools: ["mcp__clash__cancel_clash"], // no other CLASH tool
        permissionMode: "dontAsk", // every other call is denied, never prompted
        maxTurns: 4, // a runaway run ends as failed instead of looping
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

// ---- Storage and response ---------------------------------------------------

async function storeOutcome(
  id: string,
  clashId: string | null,
  outcome: UnpublishOutcome,
): Promise<Response> {
  const data =
    outcome.status === "unpublished"
      ? { status: TALK_STATUS.DRAFT, clashId: null, lastMessage: outcome.message }
      : { status: TALK_STATUS.PUBLISHED, clashId, lastMessage: outcome.message };

  // Conditional: the write lands only on a row that is still published as the
  // same clash, so a stale unpublish never resets a talk that was unpublished
  // and published again meanwhile.
  const { count } = await prisma.talk.updateMany({
    where: { id, status: TALK_STATUS.PUBLISHED, clashId },
    data,
  });
  if (count === 0) {
    const current = await prisma.talk.findUnique({ where: { id } });
    if (!current) return fail(404, "Talk was deleted during unpublish.");
    return Response.json(talkBody(current));
  }
  return Response.json(talkBody({ id, ...data }));
}

export async function POST(request: Request): Promise<Response> {
  const talkId = await readTalkId(request);
  if (talkId === null) {
    return fail(400, "Body must be JSON with a string talkId.");
  }

  let guarded: Guarded;
  try {
    guarded = await loadAndGuard(talkId);
  } catch (error) {
    return serverError(error);
  }
  if ("response" in guarded) return guarded.response;
  const { talk, settings } = guarded;

  // No try/catch here: cancelClash never throws. The write below matches the
  // clashId read at request start.
  const outcome = await cancelClash(talk.clashId, settings.hostEmail);

  try {
    return await storeOutcome(talk.id, talk.clashId, outcome);
  } catch (error) {
    return serverError(error);
  }
}
