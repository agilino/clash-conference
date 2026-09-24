"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TALK_STATUS, type TalkStatus } from "@/lib/constants";

// The row's Publish/Unpublish toggle (AD-10) and the only caller of
// /api/publish and /api/unpublish. A draft or failed talk offers Publish, a
// published one Unpublish. Nothing changes optimistically: the row shows what
// the route stored once the list has refreshed.

/** Everything that differs between the two halves of the toggle. */
type Half = {
  route: "/api/publish" | "/api/unpublish";
  variant: "default" | "outline";
  label: string;
  pendingLabel: string;
  /** "Publishing" / "Unpublishing", for the toast of a non-JSON answer. */
  verb: string;
  /** The toast of a fetch that threw (network down, dev server gone). */
  requestFailed: string;
  /** The stored status that means this half succeeded. */
  doneStatus: TalkStatus;
};

const PUBLISH: Half = {
  route: "/api/publish",
  variant: "default",
  label: "Publish to CLASH",
  pendingLabel: "Publishing…",
  verb: "Publishing",
  requestFailed: "Publish request failed",
  doneStatus: TALK_STATUS.PUBLISHED,
};

const UNPUBLISH: Half = {
  route: "/api/unpublish",
  variant: "outline",
  label: "Unpublish from CLASH",
  pendingLabel: "Unpublishing…",
  verb: "Unpublishing",
  requestFailed: "Unpublish request failed",
  doneStatus: TALK_STATUS.DRAFT,
};

/** What either route answers: `{ talk }` on 200, `{ error }` otherwise. */
type Answer = {
  talk?: { status?: unknown; lastMessage?: unknown };
  error?: unknown;
} | null;

/** Posts `{ talkId }` to the half's route and fires exactly one toast. */
async function send(half: Half, talkId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(half.route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ talkId }),
    });
  } catch (error) {
    console.error(error);
    toast.error(half.requestFailed);
    return;
  }

  // Also the answer of a route that does not exist: Next serves its HTML 404
  // page, so on 19-start this reads "… /api/publish answered 404."
  const answered = `${half.verb} failed: ${half.route} answered ${response.status}.`;
  let body: Answer;
  try {
    body = (await response.json()) as Answer;
  } catch {
    toast.error(answered);
    return;
  }

  const lastMessage = body?.talk?.lastMessage;
  if (response.ok && typeof lastMessage === "string") {
    // 200: the agent ran. Its own sentence, as success or as refusal.
    if (body?.talk?.status === half.doneStatus) toast.success(lastMessage);
    else toast.error(lastMessage);
  } else if (!response.ok && typeof body?.error === "string") {
    // 400, 404, 409, 500: the route says why.
    toast.error(body.error);
  } else {
    // JSON, but not a shape either route sends.
    toast.error(answered);
  }
}

export function PublishButton({
  talkId,
  status,
}: {
  talkId: string;
  status: TalkStatus;
}) {
  const router = useRouter();
  // `pending`: the request is in flight (spinner and pending label).
  // `isPending`: the list is refreshing afterwards. router.refresh() returns at
  // once, so without the transition the button would come back while the row
  // still shows the old status, and a second click would hit the wrong half.
  const [pending, setPending] = useState(false);
  const [isPending, startTransition] = useTransition();
  const half = status === TALK_STATUS.PUBLISHED ? UNPUBLISH : PUBLISH;

  async function handleClick() {
    setPending(true);
    await send(half, talkId);
    // On every outcome: the row shows what the route stored, or that nothing
    // was stored.
    startTransition(() => router.refresh());
    setPending(false);
  }

  return (
    <Button
      size="sm"
      variant={half.variant}
      disabled={pending || isPending}
      onClick={handleClick}
    >
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {half.pendingLabel}
        </>
      ) : (
        half.label
      )}
    </Button>
  );
}
