"use client";

import { Button } from "@/components/ui/button";
import type { TalkStatus } from "@/lib/constants";

// The 19-start form of the Publish button (AD-10): disabled on every row, the
// title says why; nothing is sent, shown or kept. Story 3.1 rewrites this file
// to make it live; the `19-start` branch restores exactly this version.
export function PublishButton(
  // Both props are read once Story 3.1 wires the route; nothing uses them yet.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  props: { talkId: string; status: TalkStatus },
) {
  return (
    <Button size="sm" disabled title="publish route missing">
      Publish to CLASH
    </Button>
  );
}
