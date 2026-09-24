import type { z } from "zod";

/** Shared shape returned by form Server Actions for `useActionState`. */
export type FormState =
  | {
      ok?: boolean;
      error?: string;
      message?: string;
      fieldErrors?: Record<string, string>;
      /**
       * The submitted text, handed back on a validation miss. React 19 resets
       * uncontrolled inputs once a form action returns, so each input renders
       * `defaultValue={state?.values?.x ?? saved.x}` and the reset restores what
       * was typed instead of the saved value.
       */
      values?: Record<string, string>;
    }
  | undefined;

/** Shape returned by non-form Server Actions (a delete button, for example). */
export type ActionResult = { ok: boolean; error?: string };

/** The submitted text of each named field, "" when a field is absent or a file. */
export function getFormValues<K extends string>(
  formData: FormData,
  names: readonly K[],
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const name of names) {
    const value = formData.get(name);
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}

/** Reduce a ZodError into the first error message per field path. */
export function getFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
