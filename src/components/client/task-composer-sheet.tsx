"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TaskComposerForm } from "./task-composer-form";

// The floating "+ Nieuwe taak" button opens this. The form itself knows nothing
// about sheets — this is the whole wrapper, because the same form is also
// rendered inline inside a person's details sheet (two stacked base-ui dialogs
// is a fight worth not having).
//
// It covers the screen rather than rising part-way up it. A half-height card
// with rounded top corners and the page peeking out behind it reads as a popup
// that interrupted something; the same content filling the viewport reads as a
// screen he opened. The client only ever uses this on a phone, where the
// half-height version also had to fit a form, a keyboard and the send button
// into whatever was left.
//
// `h-dvh` overrides the bottom variant's default `h-auto`, and it has to be
// written with the same `data-[side=bottom]:` prefix as the rule it replaces —
// otherwise both classes land in the stylesheet and the attribute selector, being
// the more specific of the two, wins.
//
// `showCloseButton={false}` because the form draws its own close button in its
// own header, where it stays reachable instead of floating over the content.
// The title stays, hidden, because a dialog wants an accessible name.
//
// `client-ui` on SheetContent is not optional: the popup renders into a portal
// on <body>, so it sits outside the shell's wrapper and would otherwise fall
// back to the operator's denser theme.

export function TaskComposerSheet({
  open,
  onOpenChange,
  presetAssigneeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetAssigneeId?: string;
  onSaved: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="client-ui gap-0 overflow-hidden data-[side=bottom]:h-dvh"
      >
        <SheetTitle className="sr-only">Nieuwe taak</SheetTitle>
        <TaskComposerForm
          presetAssigneeId={presetAssigneeId}
          onSaved={onSaved}
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
