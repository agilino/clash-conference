// The one place a talk status is spelled out. Every comparison uses TALK_STATUS,
// never a string literal, and asTalkStatus is the only string -> TalkStatus
// conversion in the repository.

export const TALK_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  FAILED: "failed",
} as const;

export type TalkStatus = (typeof TALK_STATUS)[keyof typeof TALK_STATUS];

const TALK_STATUSES: readonly string[] = Object.values(TALK_STATUS);

/**
 * Narrows a stored status string to TalkStatus. Throws on anything else, so a
 * corrupted value surfaces here instead of silently rendering as "draft".
 */
export function asTalkStatus(value: string): TalkStatus {
  if (!TALK_STATUSES.includes(value)) {
    throw new Error(`Unknown talk status: ${value}`);
  }
  return value as TalkStatus;
}
