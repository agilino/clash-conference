import { publishTalkToClash } from "@/lib/clash-agent";
import { TALK_STATUS } from "@/lib/constants";
import { getSettings } from "@/lib/data/settings";
import type { Settings, Talk } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// POST /api/publish { talkId } — one of two Route Handlers and, with
// app/api/unpublish/route.ts, one of the two writers of status, clashId and
// lastMessage (AD-2, AD-8). Every guard answers before the
// agent starts; Talk and Settings are read once, so edits made while the agent
// runs never reach it.

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function serverError(error: unknown): Response {
  console.error("POST /api/publish failed:", error);
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

type PublishOutcome = Awaited<ReturnType<typeof publishTalkToClash>>;

type Guarded = { talk: Talk; settings: Settings } | { response: Response };

async function loadAndGuard(talkId: string): Promise<Guarded> {
  const talk = await prisma.talk.findUnique({ where: { id: talkId } });
  if (!talk) return { response: fail(404, "Talk not found.") };

  const settings = await getSettings();
  if (!settings || !settings.venueName.trim() || !settings.hostEmail.trim()) {
    return {
      response: fail(
        400,
        "Complete settings first: venue name and host email are required.",
      ),
    };
  }

  if (talk.status === TALK_STATUS.PUBLISHED) {
    return {
      response: fail(
        409,
        `Talk is already published as clash ${talk.clashId}. Nothing was sent.`,
      ),
    };
  }

  return { talk, settings };
}

async function storeOutcome(id: string, outcome: PublishOutcome): Promise<Response> {
  const data =
    outcome.status === "published"
      ? {
          status: TALK_STATUS.PUBLISHED,
          clashId: outcome.clashId,
          lastMessage: outcome.message,
        }
      : { status: TALK_STATUS.FAILED, clashId: null, lastMessage: outcome.message };

  // Conditional: a late outcome never overwrites a talk that is published by now.
  const { count } = await prisma.talk.updateMany({
    where: { id, status: { not: TALK_STATUS.PUBLISHED } },
    data,
  });
  if (count === 0) {
    const current = await prisma.talk.findUnique({ where: { id } });
    if (!current) return fail(404, "Talk was deleted during publish.");
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

  // No try/catch here: publishTalkToClash never throws (AD-7).
  const outcome = await publishTalkToClash({
    eventName: settings.eventName,
    venueName: settings.venueName,
    hostEmail: settings.hostEmail,
    title: talk.title,
    description: talk.description,
    startsAtIso: talk.startsAt.toISOString(),
  });

  try {
    return await storeOutcome(talk.id, outcome);
  } catch (error) {
    return serverError(error);
  }
}
