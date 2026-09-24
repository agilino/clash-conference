import type { z } from "zod";

/** Shared shape returned by form Server Actions for `useActionState`. */
export type FormState =
  | {
      ok?: boolean;
      error?: string;
      message?: string;
      fieldErrors?: Record<string, string>;
    }
  | undefined;

/** Shape returned by non-form Server Actions (a delete button, for example). */
export type ActionResult = { ok: boolean; error?: string };

/** Reduce a ZodError into the first error message per field path. */
export function getFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
