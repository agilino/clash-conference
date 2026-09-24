import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { TALK_STATUS, type TalkStatus } from "@/lib/constants";

// The only place a status maps to a badge look (AD-14, UX-DR7). Draft is the
// neutral secondary variant, failed the destructive one, and published is green:
// the one addition to CLASH's theme, applied from here so the shadcn badge stays
// as shipped (cn merges the className after the variant's own classes). The
// status word is the badge text — never colour alone, never an icon.
const BADGE: Record<
  TalkStatus,
  { variant: ComponentProps<typeof Badge>["variant"]; className?: string }
> = {
  [TALK_STATUS.DRAFT]: { variant: "secondary" },
  [TALK_STATUS.PUBLISHED]: {
    variant: "secondary",
    className:
      "bg-green-600/10 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  },
  [TALK_STATUS.FAILED]: { variant: "destructive" },
};

export function StatusBadge({ status }: { status: TalkStatus }) {
  const { variant, className } = BADGE[status];
  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  );
}
