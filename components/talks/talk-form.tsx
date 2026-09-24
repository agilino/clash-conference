"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTalk, updateTalk } from "@/app/actions/talks";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TALK_STATUS, type TalkStatus } from "@/lib/constants";
import type { FormState } from "@/lib/form";
import { toLocalInput } from "@/lib/format";

type TalkFormProps =
  | { mode: "create"; defaultValues?: undefined }
  | {
      mode: "edit";
      defaultValues: {
        id: string;
        title: string;
        description: string;
        startsAt: Date;
        room: string | null;
        status: TalkStatus;
      };
    };

/** Reading order, so focus lands on the first invalid field, not an arbitrary one. */
const FIELD_ORDER = ["title", "description", "startsAt", "room"] as const;

type FieldName = (typeof FIELD_ORDER)[number];

const EMPTY = { title: "", description: "", startsAt: "", room: "" };

export function TalkForm(props: TalkFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<FormState, FormData>(
    props.mode === "edit" ? updateTalk : createTalk,
    undefined,
  );

  const inputs = useRef<
    Partial<Record<FieldName, HTMLInputElement | HTMLTextAreaElement | null>>
  >({});

  // One toast and one navigation per submission. useActionState hands back a new
  // state object each time, so comparing the object itself is enough — comparing
  // the message would swallow a second save with the same text.
  const handled = useRef<FormState>(undefined);

  useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;

    if (state.ok) {
      if (state.message) toast.success(state.message);
      router.push("/");
      return;
    }
    if (state.error) {
      // "Talk not found.": the row went away under the open edit form.
      toast.error(state.error);
      return;
    }
    const firstInvalid = FIELD_ORDER.find((name) => state.fieldErrors?.[name]);
    if (firstInvalid) inputs.current[firstInvalid]?.focus();
  }, [state, router]);

  const errors = state?.fieldErrors;
  // React 19 resets these uncontrolled inputs to their defaultValue whenever the
  // action returns. On a miss the action hands back what was typed, so the reset
  // keeps the organiser's edits; otherwise the saved talk (or nothing) fills the
  // form. The start is prefilled in local time, the way the input reads it.
  const saved =
    props.mode === "edit"
      ? {
          title: props.defaultValues.title,
          description: props.defaultValues.description,
          startsAt: toLocalInput(props.defaultValues.startsAt),
          room: props.defaultValues.room ?? "",
        }
      : EMPTY;
  const values = { ...saved, ...state?.values };

  return (
    // noValidate: zod owns every message. Without it the browser's own bubble
    // for an empty datetime-local would block the submit and the field error
    // would never appear.
    <form action={formAction} className="max-w-2xl space-y-4" noValidate>
      {props.mode === "edit" && (
        <input type="hidden" name="id" value={props.defaultValues.id} />
      )}

      {props.mode === "edit" &&
        props.defaultValues.status === TALK_STATUS.PUBLISHED && (
          <p className="text-sm text-muted-foreground">
            Editing changes this list only. The clash in CLASH is not updated.
          </p>
        )}

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          autoFocus={props.mode === "create"}
          ref={(el) => {
            inputs.current.title = el;
          }}
          defaultValue={values.title}
          aria-invalid={!!errors?.title}
          aria-describedby={errors?.title ? "title-error" : undefined}
        />
        {errors?.title && (
          <p id="title-error" className="text-sm text-destructive">
            {errors.title}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          ref={(el) => {
            inputs.current.description = el;
          }}
          defaultValue={values.description}
          aria-invalid={!!errors?.description}
          aria-describedby={
            errors?.description ? "description-error" : undefined
          }
        />
        {errors?.description && (
          <p id="description-error" className="text-sm text-destructive">
            {errors.description}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="startsAt">Starts at</Label>
        <Input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          ref={(el) => {
            inputs.current.startsAt = el;
          }}
          defaultValue={values.startsAt}
          aria-invalid={!!errors?.startsAt}
          aria-describedby={errors?.startsAt ? "startsAt-error" : undefined}
        />
        {errors?.startsAt && (
          <p id="startsAt-error" className="text-sm text-destructive">
            {errors.startsAt}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="room">Room</Label>
        <Input
          id="room"
          name="room"
          ref={(el) => {
            inputs.current.room = el;
          }}
          defaultValue={values.room}
          aria-invalid={!!errors?.room}
          aria-describedby={errors?.room ? "room-error" : "room-hint"}
        />
        {errors?.room ? (
          <p id="room-error" className="text-sm text-destructive">
            {errors.room}
          </p>
        ) : (
          <p id="room-hint" className="text-sm text-muted-foreground">
            Optional
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {props.mode === "edit" ? (
          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        ) : (
          <SubmitButton pendingText="Creating…">Create talk</SubmitButton>
        )}
        <Button variant="ghost" asChild>
          <Link href="/">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
