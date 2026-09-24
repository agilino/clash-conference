"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getFieldErrors, getFormValues, type FormState } from "@/lib/form";
import { settingsSchema } from "@/lib/validation";

/**
 * The only writer of the Settings table. findFirst then update, else create, so
 * the table can never hold a second row (there is no natural unique key to
 * upsert on). Never redirects: the client form toasts and navigates.
 */
export async function saveSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = getFormValues(formData, [
    "eventName",
    "venueName",
    "hostEmail",
  ]);
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) {
    // Hand the typed text back, or React's post-action reset would put the
    // saved values back into every field under the new error messages.
    return { fieldErrors: getFieldErrors(parsed.error), values };
  }

  const existing = await prisma.settings.findFirst();
  if (existing) {
    await prisma.settings.update({
      where: { id: existing.id },
      data: parsed.data,
    });
  } else {
    await prisma.settings.create({ data: parsed.data });
  }

  // "layout" so the header, which reads the record on every render, is refreshed
  // on every screen and not only on the settings page.
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}
