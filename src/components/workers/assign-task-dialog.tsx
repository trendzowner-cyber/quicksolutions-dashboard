"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaskPrioritySelect } from "@/components/taken/task-selects";
import { VoiceInputButton } from "@/components/taken/voice-input-button";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

// Quick task request, straight from the Workers screen.
//
// This is the client's own path to handing over work: he opens the board, sees
// where the work stands, and puts something on the plate without ever touching
// the dense Taken board. It lands on Telegram within seconds.

export function AssignTaskDialog({
  open,
  onOpenChange,
  worker,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker: { id: string; name: string } | null;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("algemeen");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  /** What was actually heard, shown next to the English it became. */
  const [heard, setHeard] = useState<string | null>(null);

  if (!worker) return null;

  // Speech already happened in the browser; this only translates and structures
  // it. The result lands in the fields rather than being saved outright — a
  // misheard deadline has to be visible before it reaches the board.
  const interpret = async (transcript: string, lang: string) => {
    setHeard(transcript);
    setInterpreting(true);
    try {
      const res = await fetch("/api/tasks/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, assignee: worker.name, lang }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        title?: string;
        description?: string | null;
        dueDate?: string | null;
        priority?: string;
        category?: string;
      };
      if (!res.ok) throw new Error(data.error || "Kon de opdracht niet verwerken");

      if (data.title) setTitle(data.title);
      if (data.description) setDescription(data.description);
      if (data.dueDate) setDueDate(data.dueDate);
      if (data.priority) setPriority(data.priority);
      if (data.category) setCategory(data.category);
      toast.success("Omgezet — controleer en stuur door");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwerken mislukt");
    } finally {
      setInterpreting(false);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error("Geef de taak een titel");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          category,
          assigneeId: worker.id,
          dueDate: dueDate || null,
          priority,
          status: "todo",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Toevoegen mislukt");

      toast.success(`Taak doorgestuurd naar ${worker.name}`);
      setTitle("");
      setDescription("");
      setCategory("algemeen");
      setDueDate("");
      setPriority("normal");
      setHeard(null);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toevoegen mislukt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Taak voor {worker.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assign-title">Wat moet er gebeuren?</Label>
            <Input
              id="assign-title"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              placeholder="Bijvoorbeeld: nieuwe banner voor de actie"
            />
            <div className="pt-1">
              <VoiceInputButton
                onTranscript={interpret}
                busy={interpreting}
                disabled={saving}
              />
            </div>
            {heard && (
              <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
                Gehoord: <span className="italic">{heard}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-desc">Detail (optioneel)</Label>
            <Textarea
              id="assign-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Extra uitleg voor de taak"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              {/* Optional on purpose: most of what the client dictates has no
                  date attached, and the field should not imply otherwise. */}
              <Label htmlFor="assign-due">Deadline (optioneel)</Label>
              <Input
                id="assign-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioriteit</Label>
              <TaskPrioritySelect value={priority} onChange={setPriority} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {worker.name} krijgt deze taak meteen op Telegram en op het bord.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuleren
            </Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Doorsturen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
