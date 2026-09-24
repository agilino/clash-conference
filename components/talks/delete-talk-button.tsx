"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteTalk } from "@/app/actions/talks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/form";

/**
 * Trash trigger plus the confirmation dialog. The dialog is controlled: the
 * action never redirects, so this component closes the dialog itself on both
 * outcomes, toasts and refreshes the list. Radix focuses Cancel when the dialog
 * opens and returns focus to the trigger when it closes — except once the
 * action has answered: the refresh may have unmounted the trigger with the row
 * (it always has after a success), so focus moves to the page heading instead.
 */
export function DeleteTalkButton({
  talkId,
  title,
}: {
  talkId: string;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Whether the action has answered since the dialog opened; read when the
  // dialog hands focus back.
  const answered = useRef(false);

  function handleDelete() {
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await deleteTalk(talkId);
      } catch (error) {
        // The call itself failed (connection lost, dev server restarted): log
        // it, since the toast cannot say why, then end like a delete the action
        // refused.
        console.error(error);
        result = { ok: false };
      }
      answered.current = true;
      setOpen(false);
      if (result.ok) {
        toast.success("Talk deleted.");
      } else {
        toast.error(result.error ?? "Could not delete this talk.");
      }
      // On both outcomes: a row that was already deleted elsewhere must leave
      // the list too, not stay behind as a dead row under the error toast.
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Radix lets Escape through although both buttons are disabled; ignore
        // a close request until the action has answered.
        if (next) answered.current = false;
        if (next || !isPending) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={"Delete " + title}
          className="text-muted-foreground hover:text-destructive focus-visible:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (!answered.current) return;
          // The list refreshes on both outcomes, so the trigger Radix would
          // return focus to may be gone with the row and focus would fall to
          // <body>; keep it on the page.
          event.preventDefault();
          document.querySelector<HTMLElement>("main h1")?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this talk?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{title}&rdquo; will be removed from this list. If it was
            published, the clash in CLASH stays. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Radix closes the dialog on Action by default; keep it open
              // (both buttons disabled, Escape ignored) until the action has
              // answered.
              e.preventDefault();
              handleDelete();
            }}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete talk
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
