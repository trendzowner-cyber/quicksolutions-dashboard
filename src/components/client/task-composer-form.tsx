"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaskAssigneeSelect } from "@/components/taken/task-selects";
import { ClientVoicePanel } from "@/components/client/client-voice-panel";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Repeat, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALL_DAYS,
  DAY_LABELS,
  describeDays,
  parseTimeToMinutes,
} from "@/lib/recurring";
import type { TaskUser } from "@/lib/tasks";

// One composer, two shapes. The client either asks for something once, or asks
// for it to keep happening — and the only difference between the two screens is
// a date field versus weekdays and a time.
//
// Everything the operator's dialogs ask for and this one does not: priority,
// category, status, subtasks, tags. He is not triaging work, he is describing
// it. Those fields keep their defaults and the board sorts it out.
//
// ── The shape of the screen ──
//
// This is a full-height column, not a stack of fields in a scrolling card: a
// header that never moves, a body that is the only thing that scrolls, and the
// send button pinned to the bottom. It was a partial-height sheet before, and
// the three things that made it feel like a popup rather than a screen were all
// consequences of that — the title scrolled out of sight, the way to send was
// below everything you had to read first, and the card floated over the page
// instead of replacing it. Filling the screen and pinning both ends is what
// makes it read as a place you went to rather than a box that appeared.
//
// Voice works in both shapes too. Which one it fills is decided by the toggle
// BEFORE he talks, not guessed from the sentence — "check the reviews every
// day" and "check the reviews today" differ by one word and produce different
// kinds of row.

const DEFAULT_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_TIME = "15:00";

function DayChips({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  const toggle = (day: number) => {
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : [...value, day].sort((a, b) => a - b)
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_DAYS.map((day) => {
        const on = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            onClick={() => toggle(day)}
            aria-pressed={on}
            // h-12 rather than the operator's h-8: this gets tapped with a
            // thumb, not clicked with a mouse.
            className={cn(
              "h-12 w-12 rounded-xl text-base font-medium transition-colors",
              on
                ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                : "bg-muted text-muted-foreground",
              disabled && "opacity-50"
            )}
          >
            {DAY_LABELS[day - 1]}
          </button>
        );
      })}
    </div>
  );
}

export function TaskComposerForm({
  heading = "Nieuwe taak",
  back,
  presetAssigneeId,
  onSaved,
  onCancel,
}: {
  heading?: string;
  /**
   * Reached from a person's card, the way out goes back to that person rather
   * than closing everything — so it is a back arrow and not a cross.
   */
  back?: boolean;
  /** Pre-selected when opened from a person's card. */
  presetAssigneeId?: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<"eenmalig" | "herhalen">("eenmalig");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(presetAssigneeId ?? "");
  const [dueDate, setDueDate] = useState("");
  const [days, setDays] = useState<number[]>(DEFAULT_DAYS);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState<"voice" | "save" | null>(null);

  const [users, setUsers] = useState<TaskUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users?scope=assignable")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUsers(data.users ?? []);
      })
      .catch(() => {
        // The picker stays empty; saving will say who is missing.
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const interpret = async (transcript: string, lang: string) => {
    setHeard(transcript);
    setBusy("voice");
    try {
      const res = await fetch("/api/tasks/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          lang,
          assignee: users.find((u) => u.id === assigneeId)?.name,
          mode: mode === "herhalen" ? "recurring" : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        title?: string;
        description?: string | null;
        dueDate?: string | null;
        days?: number[];
        deadline?: string;
      };
      if (!res.ok) throw new Error(data.error || "Kon de opdracht niet verwerken");

      if (data.title) setTitle(data.title);
      if (data.description) setDescription(data.description);
      // Only the fields belonging to the current shape are touched, so a
      // leftover date can't ride along into a recurring row.
      if (mode === "eenmalig") {
        if (data.dueDate) setDueDate(data.dueDate);
      } else {
        if (Array.isArray(data.days) && data.days.length) setDays(data.days);
        if (data.deadline) setTime(data.deadline);
      }
      toast.success("Omgezet — controleer en stuur door");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwerken mislukt");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error("Wat moet er gebeuren?");
      return;
    }
    if (!assigneeId) {
      toast.error("Kies voor wie de taak is");
      return;
    }

    const minutes = parseTimeToMinutes(time);
    if (mode === "herhalen") {
      if (!days.length) {
        toast.error("Kies minstens één dag");
        return;
      }
      if (minutes === null) {
        toast.error("Kies een geldig uur");
        return;
      }
    }

    setBusy("save");
    try {
      const res = await fetch(
        mode === "herhalen" ? "/api/recurring-tasks" : "/api/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "herhalen"
              ? {
                  title: title.trim(),
                  description: description.trim() || null,
                  assigneeId,
                  days,
                  deadlineMinutes: minutes,
                  remindBeforeMinutes: 30,
                }
              : {
                  title: title.trim(),
                  description: description.trim() || null,
                  assigneeId,
                  dueDate: dueDate || null,
                  priority: "normal",
                  category: "algemeen",
                  status: "todo",
                }
          ),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Toevoegen mislukt");

      toast.success(
        mode === "herhalen" ? "Terugkerende taak ingesteld" : "Taak doorgestuurd"
      );
      setTitle("");
      setDescription("");
      setDueDate("");
      setHeard(null);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toevoegen mislukt");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Fixed. The title and the way out stay put however far down the form
          he has scrolled — which is the whole reason this is a header rather
          than the first item in the scroll.
          The top padding is the notch, not taste: the app installs standalone,
          so this screen begins at the very top of the display and the title
          would otherwise sit underneath the clock and the battery. */}
      <header className="flex shrink-0 items-center gap-1 border-b border-border px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        {onCancel && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={back ? "Terug" : "Sluiten"}
            onClick={onCancel}
            disabled={busy !== null}
            className="h-11 w-11 shrink-0"
          >
            {back ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </Button>
        )}
        <h2 className="min-w-0 flex-1 truncate px-1 text-lg font-semibold">
          {heading}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 px-4 py-5">
          {/* Who, and which shape, come FIRST — before a word is spoken. Both
              are inputs to the voice conversion rather than just to the save:
              the assignee's name is handed to the model so it can write the
              instruction for the right person, and the mode decides whether the
              sentence becomes a one-off task or a weekly obligation. Asking for
              either one after the microphone has already been used means
              speaking into a form that does not yet know what it is collecting. */}
          <div className="space-y-2">
            <Label className="text-base">Voor wie?</Label>
            <TaskAssigneeSelect
              value={assigneeId}
              onChange={setAssigneeId}
              users={users}
              size="default"
              disabled={busy !== null || usersLoading}
            />
          </div>

          {/* Once, or every week. Two buttons rather than a dropdown: there are
              only two answers and he picks one every time. */}
          <div className="space-y-2">
            <Label className="text-base">Eenmalig of herhalen?</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["eenmalig", "herhalen"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  disabled={busy !== null}
                  className={cn(
                    "flex h-14 items-center justify-center gap-2 rounded-xl text-base font-medium transition-colors",
                    mode === value
                      ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {value === "herhalen" && <Repeat className="h-5 w-5" />}
                  {value === "eenmalig" ? "Eenmalig" : "Elke week"}
                </button>
              ))}
            </div>
            <p className="px-1 text-sm leading-snug text-muted-foreground">
              {mode === "herhalen"
                ? "Komt steeds terug, op de dagen die je hieronder kiest."
                : "Wordt één keer uitgevoerd."}
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="client-task-title" className="text-base">
              Wat moet er gebeuren?
            </Label>

            {/* Speaking comes before the text field rather than below it: it is
                how this client actually hands over work, and a control under
                the input ends up behind the on-screen keyboard the moment the
                field is focused. */}
            <ClientVoicePanel
              onTranscript={interpret}
              busy={busy === "voice"}
              disabled={busy === "save"}
            />

            <Input
              id="client-task-title"
              value={title}
              // No autoFocus: on a phone that throws the keyboard up over the
              // whole form the instant the screen opens. The keyboard should
              // wait to be asked for.
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Of typ het hier"
              autoCapitalize="sentences"
              enterKeyHint="done"
              className="h-14 text-base"
            />

            {/* What was heard, in the language it was heard in, next to a note
                about the language it comes out in. Without that note the two
                disagree on screen — he spoke Dutch and an English title appears
                above it — and the mismatch reads as a bug, not a translation. */}
            {heard && (
              <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-sm font-medium text-muted-foreground">Jij zei</p>
                <p className="mt-0.5 text-base italic leading-snug">{heard}</p>
                <p className="mt-2 text-sm leading-snug text-muted-foreground">
                  De taak komt in het Engels op het bord te staan.
                </p>
              </div>
            )}
          </div>

          {mode === "eenmalig" ? (
            <div className="space-y-2">
              {/* Optional on purpose: most of what he asks for has no date
                  attached, and the field should not imply otherwise. */}
              <Label htmlFor="client-task-due" className="text-base">
                Deadline (mag leeg blijven)
              </Label>
              <Input
                id="client-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-14 text-base"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base">Welke dagen?</Label>
                <DayChips value={days} onChange={setDays} disabled={busy !== null} />
                <p className="text-sm text-muted-foreground">
                  {days.length ? describeDays(days) : "Nog geen dag gekozen"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-task-time" className="text-base">
                  Tegen welk uur?
                </Label>
                <Input
                  id="client-task-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-14 text-base"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="client-task-desc" className="text-base">
              Extra uitleg (mag leeg blijven)
            </Label>
            <Textarea
              id="client-task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Alles wat hij moet weten"
              className="min-h-[80px] text-base"
            />
          </div>
        </div>
      </div>

      {/* Pinned. The action is reachable with a thumb without scrolling to it,
          and it clears the iPhone home indicator instead of sitting under it. */}
      <footer className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <Button
          onClick={save}
          disabled={busy !== null}
          className="h-14 w-full text-base"
        >
          {busy === "save" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
          {mode === "herhalen" ? "Terugkerende taak instellen" : "Taak sturen"}
        </Button>
      </footer>
    </div>
  );
}
