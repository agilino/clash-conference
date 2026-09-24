"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getFieldErrors, type FormState } from "@/lib/form";
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
  const parsed = settingsSchema.safeParse({
    eventName: formData.get("eventName"),
    venueName: formData.get("venueName"),
    hostEmail: formData.get("hostEmail"),
  });
  if (!parsed.success) {
    return { fieldErrors: getFieldErrors(parsed.error) };
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
