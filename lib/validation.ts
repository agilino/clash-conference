import { z } from "zod";

// The one place a user-facing validation message is spelled out. Story 2.2 adds
// talkSchema and talkStatusSchema here.

export const settingsSchema = z.object({
  eventName: z.string().trim().min(1, "Event name is required."),
  // Stored exactly as typed: nothing checks it against CLASH.
  venueName: z.string().trim().min(1, "Venue name is required."),
  // zod 4 moved the email check to a top-level schema, so trim first, then pipe.
  hostEmail: z.string().trim().pipe(z.email("Enter a valid email address.")),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
