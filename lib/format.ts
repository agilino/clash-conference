import { format } from "date-fns";

// The only place a date is formatted. Not server-only: the talk form prefills
// its datetime-local input with toLocalInput on the client.

/** The value of a datetime-local input, in local time: "2026-10-08T10:00". */
export function toLocalInput(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** A start as the talks list shows it (UX-DR6): "Thu 8 Oct 2026, 10:00". */
export function formatDateTime(date: Date): string {
  return format(date, "EEE d MMM yyyy, HH:mm");
}
