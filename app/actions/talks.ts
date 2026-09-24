"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  getFieldErrors,
  getFormValues,
  type ActionResult,
  type FormState,
} from "@/lib/form";
import { talkSchema } from "@/lib/validation";

// The only writer of title, description, startsAt and room, and the only place
// a Talk row is deleted (AD-2). status, clashId and lastMessage belong to the
// publish route (Epic 3) and are never touched here, not even on an update of a
// published talk. None of these actions redirects: the client toasts and
// navigates.

const TALK_FIELDS = ["title", "description", "startsAt", "room"] as const;

export async function createTalk(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = getFormValues(formData, TALK_FIELDS);
  const parsed = talkSchema.safeParse(values);
  if (!parsed.success) {
    // Hand the typed text back, or React's post-action reset would empty every
    // field under the new error messages.
    return { fieldErrors: getFieldErrors(parsed.error), values };
  }

  const { title, description, startsAt, room } = parsed.data;
  // status, clashId, lastMessage and createdAt take their column defaults.
  await prisma.talk.create({ data: { title, description, startsAt, room } });

  revalidatePath("/");
  return { ok: true, message: "Talk created." };
}

export async function updateTalk(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = formData.get("id");
  const values = getFormValues(formData, TALK_FIELDS);
  const parsed = talkSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: getFieldErrors(parsed.error), values };
  }

  const existing =
    typeof id === "string" && id
      ? await prisma.talk.findUnique({ where: { id } })
      : null;
  if (!existing) {
    // values for the same reason as on a validation miss: the toast must not
    // sit above a form that lost what was typed.
    return { error: "Talk not found.", values };
  }

  const { title, description, startsAt, room } = parsed.data;
  await prisma.talk.update({
    where: { id: existing.id },
    data: { title, description, startsAt, room },
  });

  revalidatePath("/");
  revalidatePath("/talks/" + existing.id + "/edit");
  return { ok: true, message: "Talk saved." };
}

export async function deleteTalk(id: string): Promise<ActionResult> {
  try {
    // Throws (P2025) when no row has this id, for example after a delete from a
    // second tab; the button toasts the error instead of the success message.
    await prisma.talk.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Could not delete this talk." };
  }

  revalidatePath("/");
  return { ok: true };
}
