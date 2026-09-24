"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveSettings } from "@/app/actions/settings";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form";

type SettingsFormProps = {
  defaultValues: {
    eventName: string;
    venueName: string;
    hostEmail: string;
  };
};

/** Reading order, so focus lands on the first invalid field, not an arbitrary one. */
const FIELD_ORDER = ["eventName", "venueName", "hostEmail"] as const;

type FieldName = (typeof FIELD_ORDER)[number];

export function SettingsForm({ defaultValues }: SettingsFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<FormState, FormData>(
    saveSettings,
    undefined,
  );

  const inputs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>(
    {},
  );

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
    const firstInvalid = FIELD_ORDER.find((name) => state.fieldErrors?.[name]);
    if (firstInvalid) inputs.current[firstInvalid]?.focus();
  }, [state, router]);

  const errors = state?.fieldErrors;

  return (
    // noValidate: zod owns every message. Without it the browser's own email
    // bubble would block the submit and the field error would never appear.
    <form action={formAction} className="max-w-2xl space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="eventName">Event name</Label>
        <Input
          id="eventName"
          name="eventName"
          ref={(el) => {
            inputs.current.eventName = el;
          }}
          defaultValue={defaultValues.eventName}
          aria-invalid={!!errors?.eventName}
          aria-describedby={errors?.eventName ? "eventName-error" : undefined}
        />
        {errors?.eventName && (
          <p id="eventName-error" className="text-sm text-destructive">
            {errors.eventName}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="venueName">CLASH venue name</Label>
        <Input
          id="venueName"
          name="venueName"
          ref={(el) => {
            inputs.current.venueName = el;
          }}
          defaultValue={defaultValues.venueName}
          aria-invalid={!!errors?.venueName}
          aria-describedby={
            errors?.venueName ? "venueName-error" : "venueName-hint"
          }
        />
        {errors?.venueName ? (
          <p id="venueName-error" className="text-sm text-destructive">
            {errors.venueName}
          </p>
        ) : (
          <p id="venueName-hint" className="text-sm text-muted-foreground">
            Must equal a venue title in CLASH, for example Holzmarkt 25.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="hostEmail">Host email</Label>
        <Input
          id="hostEmail"
          name="hostEmail"
          type="email"
          ref={(el) => {
            inputs.current.hostEmail = el;
          }}
          defaultValue={defaultValues.hostEmail}
          aria-invalid={!!errors?.hostEmail}
          aria-describedby={
            errors?.hostEmail ? "hostEmail-error" : "hostEmail-hint"
          }
        />
        {errors?.hostEmail ? (
          <p id="hostEmail-error" className="text-sm text-destructive">
            {errors.hostEmail}
          </p>
        ) : (
          <p id="hostEmail-hint" className="text-sm text-muted-foreground">
            A CLASH user&apos;s email, for example anna.schmidt@example.com.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href="/">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
