import Link from "next/link";
import { DeleteTalkButton } from "@/components/talks/delete-talk-button";
import { PublishButton } from "@/components/talks/publish-button";
import { StatusBadge } from "@/components/talks/status-badge";
import { Button } from "@/components/ui/button";
import { asTalkStatus, TALK_STATUS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { Talk } from "@/lib/generated/prisma/client";

/**
 * The start page's row list (UX-DR6/7/15): a bordered, divided list, not a
 * table; rows are not links and hold no client state. Each row's stored status
 * is narrowed once here and the children receive the typed value. Below `sm`
 * the action cluster wraps under the text, left-aligned, in the same order.
 */
export function TalkList({ talks }: { talks: Talk[] }) {
  return (
    <ul className="divide-y rounded-xl border">
      {talks.map((talk) => {
        const status = asTalkStatus(talk.status);
        return (
          <li
            key={talk.id}
            className="flex min-h-11 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-medium break-words">{talk.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(talk.startsAt)}
                {talk.room ? ` · ${talk.room}` : null}
              </p>
              {status === TALK_STATUS.FAILED && (
                // The agent's own words, in full: never shortened or reworded.
                // Line breaks in the message are kept; long tokens wrap.
                <p className="text-sm text-destructive break-words whitespace-pre-wrap">
                  {talk.lastMessage}
                </p>
              )}
              {status === TALK_STATUS.PUBLISHED && (
                <p className="font-mono text-xs text-muted-foreground break-words">
                  Clash {talk.clashId}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <StatusBadge status={status} />
              <PublishButton talkId={talk.id} status={status} />
              <Button variant="outline" size="sm" asChild>
                {/* aria-label: every Edit link would otherwise share one
                    accessible name. Playwright's { name: "Edit" } still
                    matches by substring. */}
                <Link
                  href={`/talks/${talk.id}/edit`}
                  aria-label={"Edit " + talk.title}
                >
                  Edit
                </Link>
              </Button>
              <DeleteTalkButton talkId={talk.id} title={talk.title} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
