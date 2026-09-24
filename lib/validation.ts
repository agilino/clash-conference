import { z } from "zod";
import { TALK_STATUS } from "@/lib/constants";

// The one place a user-facing validation message is spelled out.

export const settingsSchema = z.object({
  eventName: z.string().trim().min(1, "Event name is required."),
  // Stored exactly as typed: nothing checks it against CLASH.
  venueName: z.string().trim().min(1, "Venue name is required."),
  // zod 4 moved the email check to a top-level schema, so trim first, then pipe.
  hostEmail: z.string().trim().pipe(z.email("Enter a valid email address.")),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

// The zod enum for validating request or form input (AD-4). A stored status
// string still goes through asTalkStatus in lib/constants.ts, the only string
// -> TalkStatus conversion.
export const talkStatusSchema = z.enum([
  TALK_STATUS.DRAFT,
  TALK_STATUS.PUBLISHED,
  TALK_STATUS.FAILED,
]);

export const talkSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  description: z.string().trim().min(1, "Description is required."),
  // The datetime-local string ("2026-10-08T10:00") carries no offset, so the
  // coercion reads it as server local time — the browser's local time, since
  // both run on the same machine. An empty string coerces to an Invalid Date,
  // which zod 4 rejects with this message.
  startsAt: z.coerce.date("Enter a valid date and time."),
  // Optional: a blank room is stored as null, never as "".
  room: z
    .string()
    .trim()
    .transform((value) => value || null),
});

export type TalkInput = z.infer<typeof talkSchema>;
