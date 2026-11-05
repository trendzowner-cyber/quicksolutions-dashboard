"use client";

import { useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  TaskAssigneeSelect,
  TaskCategorySelect,
  TaskPrioritySelect,
  TaskStatusSelect,
} from "./task-selects";
import { toast } from "sonner";
import { Loader2, Plus, Send, Trash2, X } from "lucide-react";
import {
  NONE,
  formatDateLong,
  type TaskData,
  type TaskUser,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Onbekende fout");
  return data as T;
}

// ═══════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════

interface CreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: TaskUser[];
  defaults: { status?: string; dueDate?: string };
  onCreated: (task: TaskData) => void;
}

export function TaskCreateDialog({
  open,
  onOpenChange,
  users,
  defaults,
  onCreated,
}: CreateProps) {
  // The caller keys this component on its defaults, so opening it from a
  // column or a calendar day remounts it already seeded with that context —
  // no reset effect fighting React's render cycle.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("algemeen");
  const [status, setStatus] = useState(defaults.status ?? "todo");
  const [assigneeId, setAssigneeId] = useState(NONE);
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? "");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const { task } = await api<{ task: TaskData }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          category,
          status,
          assigneeId: assigneeId === NONE ? null : assigneeId,
          dueDate: dueDate || null,
          subtasks: subtasks
            .filter((s) => s.trim())
            .map((s) => ({ title: s.trim() })),
        }),
      });
      onCreated(task);
      toast.success("Taak aangemaakt");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aanmaken mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Taak</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Titel *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              placeholder="Wat moet er gebeuren?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Beschrijving</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <TaskStatusSelect value={status} onChange={setStatus} size="default" />
            </div>
            <div className="space-y-1.5">
              <Label>Prioriteit</Label>
              <TaskPrioritySelect value={priority} onChange={setPriority} size="default" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <TaskCategorySelect value={category} onChange={setCategory} size="default" />
            </div>
            <div className="space-y-1.5">
              <Label>Deadline</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Toegewezen aan</Label>
            <TaskAssigneeSelect
              value={assigneeId}
              onChange={setAssigneeId}
              users={users}
              size="default"
            />
          </div>

          <div className="space-y-2">
            <Label>Subtaken</Label>
            {subtasks.map((st, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={st}
                  onChange={(e) => {
                    const next = [...subtasks];
                    next[i] = e.target.value;
                    setSubtasks(next);
                  }}
                  placeholder="Subtaak..."
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Subtaak verwijderen"
                  onClick={() => setSubtasks((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setSubtasks((prev) => [...prev, ""])}
            >
              <Plus className="h-3.5 w-3.5" />
              Subtaak
            </Button>
          </div>

          <Button type="submit" className="w-full gap-1.5" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Taak Aanmaken
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════
// DETAIL
// ═══════════════════════════════════════════

interface DetailProps {
  task: TaskData | null;
  users: TaskUser[];
  onClose: () => void;
  onUpdated: (id: string, patch: Partial<TaskData>) => void;
  onDeleted: (id: string) => void;
}

export function TaskDetailDialog({
  task,
  users,
  onClose,
  onUpdated,
  onDeleted,
}: DetailProps) {
  // Keyed on the task id by the caller, so each task opens a fresh editor.
  const [draft, setDraft] = useState<TaskData | null>(task);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [subtaskInput, setSubtaskInput] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  if (!draft) return null;

  /** Applies a field change to the server and both local copies of the task. */
  async function patch(patchBody: Record<string, unknown>) {
    if (!draft) return;
    const previous = draft;
    setDraft({ ...draft, ...(patchBody as Partial<TaskData>) });
    onUpdated(draft.id, patchBody as Partial<TaskData>);
    try {
      await api(`/api/tasks/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
    } catch (err) {
      setDraft(previous);
      onUpdated(previous.id, previous);
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt");
    }
  }

  async function saveText() {
    if (!draft) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitle(draft.title);
      return;
    }
    if (nextTitle === draft.title && description === (draft.description ?? "")) return;
    await patch({ title: nextTitle, description: description.trim() || null });
  }

  async function toggleSubtask(subtaskId: string, current: string) {
    if (!draft) return;
    const status = current === "done" ? "todo" : "done";
    const subtasks = draft.subtasks.map((s) => (s.id === subtaskId ? { ...s, status } : s));
    setDraft({ ...draft, subtasks });
    onUpdated(draft.id, { subtasks });
    try {
      await api(`/api/tasks/${draft.id}/subtasks/${subtaskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch {
      toast.error("Subtaak bijwerken mislukt");
    }
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !subtaskInput.trim()) return;
    try {
      const { subtask } = await api<{ subtask: TaskData["subtasks"][number] }>(
        `/api/tasks/${draft.id}/subtasks`,
        { method: "POST", body: JSON.stringify({ title: subtaskInput.trim() }) }
      );
      const subtasks = [...draft.subtasks, subtask];
      setDraft({ ...draft, subtasks });
      onUpdated(draft.id, { subtasks });
      setSubtaskInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toevoegen mislukt");
    }
  }

  async function removeSubtask(subtaskId: string) {
    if (!draft) return;
    const subtasks = draft.subtasks.filter((s) => s.id !== subtaskId);
    setDraft({ ...draft, subtasks });
    onUpdated(draft.id, { subtasks });
    try {
      await api(`/api/tasks/${draft.id}/subtasks/${subtaskId}`, { method: "DELETE" });
    } catch {
      toast.error("Verwijderen mislukt");
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !comment.trim()) return;
    const text = comment.trim();
    setComment("");
    try {
      const { comment: created } = await api<{
        comment: TaskData["comments"][number];
      }>(`/api/tasks/${draft.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      });
      const comments = [...draft.comments, created];
      setDraft({ ...draft, comments });
      onUpdated(draft.id, { comments });
    } catch (err) {
      setComment(text);
      toast.error(err instanceof Error ? err.message : "Reactie mislukt");
    }
  }

  async function remove() {
    if (!draft || !confirm(`"${draft.title}" verwijderen?`)) return;
    setBusy(true);
    try {
      await api(`/api/tasks/${draft.id}`, { method: "DELETE" });
      toast.success("Taak verwijderd");
      onDeleted(draft.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt");
    } finally {
      setBusy(false);
    }
  }

  const doneSubtasks = draft.subtasks.filter((s) => s.status === "done").length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-2 pr-8">
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveText}
              onKeyDown={(e) => e.key === "Enter" && titleRef.current?.blur()}
              className="h-auto border-transparent bg-transparent px-0 text-base font-semibold shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Taak verwijderen"
              className="shrink-0 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
              onClick={remove}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <TaskStatusSelect
              value={draft.status}
              onChange={(v) => patch({ status: v })}
              size="default"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prioriteit</Label>
            <TaskPrioritySelect
              value={draft.priority}
              onChange={(v) => patch({ priority: v })}
              size="default"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Toegewezen aan</Label>
            <TaskAssigneeSelect
              value={draft.assignee?.id ?? NONE}
              onChange={(v) => patch({ assigneeId: v === NONE ? null : v })}
              users={users}
              size="default"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Deadline</Label>
            <Input
              type="date"
              value={draft.dueDate ?? ""}
              onChange={(e) => patch({ dueDate: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Categorie</Label>
            <TaskCategorySelect
              value={draft.category}
              onChange={(v) => patch({ category: v })}
              size="default"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Aangemaakt</Label>
            <p className="flex h-8 items-center text-sm text-muted-foreground">
              {formatDateLong(draft.createdAt)}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Beschrijving</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveText}
            placeholder="Voeg details toe..."
            rows={3}
          />
        </div>

        {/* Subtasks */}
        <div className="space-y-2">
          <Label className="text-xs">
            Subtaken
            {draft.subtasks.length > 0 && ` (${doneSubtasks}/${draft.subtasks.length})`}
          </Label>
          <div className="space-y-1">
            {draft.subtasks.map((st) => (
              <div
                key={st.id}
                className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40"
              >
                <Checkbox
                  checked={st.status === "done"}
                  onCheckedChange={() => toggleSubtask(st.id, st.status)}
                  aria-label={st.title}
                />
                <span
                  className={cn(
                    "flex-1 text-sm",
                    st.status === "done" && "text-muted-foreground line-through"
                  )}
                >
                  {st.title}
                </span>
                <button
                  type="button"
                  aria-label={`${st.title} verwijderen`}
                  onClick={() => removeSubtask(st.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400" />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addSubtask} className="flex gap-2">
            <Input
              value={subtaskInput}
              onChange={(e) => setSubtaskInput(e.target.value)}
              placeholder="Subtaak toevoegen..."
              className="h-8 text-sm"
            />
            <Button
              type="submit"
              variant="outline"
              size="icon-sm"
              aria-label="Subtaak toevoegen"
              className="shrink-0"
              disabled={!subtaskInput.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>

        {/* Comments */}
        <div className="space-y-2">
          <Label className="text-xs">Reacties ({draft.comments.length})</Label>
          {draft.comments.length > 0 && (
            <div className="space-y-2">
              {draft.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-muted/50 p-2.5">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">
                      {c.author?.name ?? "Onbekend"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateLong(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addComment} className="flex gap-2">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Voeg een reactie toe..."
              className="h-8 text-sm"
            />
            <Button
              type="submit"
              variant="outline"
              size="icon-sm"
              aria-label="Reactie plaatsen"
              className="shrink-0"
              disabled={!comment.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
