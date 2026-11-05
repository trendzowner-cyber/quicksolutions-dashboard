"use client";

// Role-based Reviews page. Three completely different experiences, decided
// server-side by /api/reviews/groups:
//   member (normal team member) → "Mijn Taken": a personal, calm to-do list.
//     Only their own assigned reviews, 3 friendly buttons, progress bar.
//   lead   (group lead)         → "Team Overzicht": their group's members
//     with progress bars + rotate-team button.
//   admin  (owner/admin)        → the full dashboard, but simplified: context
//     stats, "Vandaag prioriteit", a dropdown filter and rows that expand
//     only when clicked.
//
// Assignment happens in lib/review-groups.ts: the ACTIVE group (Team A /
// Team B, weekly rotation) gets actionable reviews distributed evenly among
// its members each ISO week.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Star,
  Flag,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Send,
  History,
  Banknote,
  Pencil,
  PartyPopper,
  CalendarCheck,
  Upload,
  FileText,
  Search,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Hand,
  Users,
  AlertTriangle,
  XCircle,
  StickyNote,
  MessageSquare,
  Info,
  Sparkles,
} from "lucide-react";
import { OUTCOME_NL, ACTION_LABELS, STAGE_NL } from "@/lib/review-outcomes";
import { publicReviewLink } from "@/lib/review-link";

// ═══════════════════════════════════════════
// TYPES & HELPERS
// ═══════════════════════════════════════════

interface Review {
  id: string;
  googleReviewId: string;
  locationName: string | null;
  reviewerName: string;
  starRating: number;
  comment: string | null;
  createTime: string | null;
  status: string;
  reported: boolean;
  reportedAt: string | null;
  reportOutcome: string | null;
  reportCount: number;
  followUpAt: string | null;
  notes: string | null;
  replyText: string | null;
  repliedAt: string | null;
  reviewUrl: string | null;
  aiFakeScore: number | null;
  removalStage: string | null;
  removalDueAt: string | null;
  removalPrice: number | null;
  paidAt: string | null;
  replyPending: boolean;
  reportCaseId: string | null;
  escalatedAt: string | null;
  editedAt: string | null;
  editCount: number;
}

interface TaskItem {
  review: Review;
  assignmentId: string;
  status: string; // todo | done
}

interface MemberProgress {
  id: string;
  name: string;
  total: number;
  done: number;
}

interface GroupsPayload {
  mode: "admin" | "lead" | "member";
  me: { id: string; name: string; role: string; groupId: string | null };
  group: { id: string; name: string; active?: boolean } | null;
  activeGroup: { id: string; name: string };
  tasks?: TaskItem[];
  /** The member's own reports this week — the "Gerapporteerd" tab. */
  myDone?: TaskItem[];
  /** Shared list of unanswered 4-5★ reviews — the "Antwoorden" section. */
  positive?: TaskItem[];
  progress?: { done: number; total: number };
  members?: MemberProgress[];
  groups?: { id: string; name: string; sortOrder: number; active: boolean; leadUserId: string | null }[];
  unassigned?: number;
}

interface SyncLog {
  status: string;
  startedAt: string;
  finishedAt: string | null;
  newCount: number;
  removedCount: number;
  error: string | null;
}

interface Place {
  placeId: string;
  displayName: string | null;
  rating: number | null;
  reviewCount: number | null;
  mapsUri: string | null;
}

const PAGE_SIZE = 20;

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "zojuist";
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  if (s < 86400) return `${Math.floor(s / 3600)} uur geleden`;
  return `${Math.floor(s / 86400)} d geleden`;
}

function isSuspiciousLocal(r: Pick<Review, "aiFakeScore" | "starRating">): boolean {
  return (r.aiFakeScore ?? 0) >= 70 || r.starRating <= 2;
}

// What still needs doing on this review — mirrors lib/review-groups.ts so the
// buttons on a card always match what the assignment system tracks.
function needsReply(r: Review): boolean {
  return !r.replyText && !r.replyPending;
}
function needsReport(r: Review): boolean {
  // Mirrors isMemberWork in lib/review-groups.ts: every unreported bad review
  // is report work now, not just the AI-suspicious ones.
  return !r.reported && r.starRating <= 3;
}
function needsFollow(r: Review): boolean {
  return (
    r.reported && !!r.followUpAt && new Date(r.followUpAt).getTime() <= Date.now()
  );
}

// Compact Google-style page list: 1 … 4 5 6 … 12
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const nums: (number | "…")[] = [1];
  if (current > 3) nums.push("…");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    nums.push(i);
  }
  if (current < total - 2) nums.push("…");
  nums.push(total);
  return nums;
}

function starClasses(rating: number): string {
  if (rating >= 5) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  if (rating === 4) return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30";
  if (rating === 3) return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
}

function StarChip({ rating }: { rating: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${starClasses(rating)}`}
    >
      <Star className="h-3 w-3 fill-current" />
      {rating}
    </span>
  );
}

function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className}`}>
      <div
        className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

async function patchReview(id: string, body: Record<string, unknown>): Promise<Review | null> {
  const res = await fetch(`/api/reviews/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()).review as Review;
}

// ═══════════════════════════════════════════
// MEMBER VIEW — "Mijn Taken"
// ═══════════════════════════════════════════

function MemberCard({
  task,
  onRefresh,
}: {
  task: TaskItem;
  onRefresh: () => Promise<void>;
}) {
  const r = task.review;
  const done = task.status === "done";
  const [open, setOpen] = useState<"reply" | "follow" | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  async function sendReply() {
    if (!replyText.trim()) return;
    setBusy("reply");
    try {
      const res = await fetch(`/api/reviews/${r.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(
          d.google
            ? "Antwoord staat live op Google"
            : "Antwoord opgeslagen — wordt automatisch live gezet"
        );
        setOpen(null);
        setReplyText("");
        await onRefresh();
      } else {
        toast.error("Kon het antwoord niet opslaan");
      }
    } catch {
      toast.error("Verbindingsfout");
    }
    setBusy(null);
  }

  async function markReported() {
    setBusy("report");
    const updated = await patchReview(r.id, { reported: true });
    setBusy(null);
    if (updated) {
      toast.success("Gemeld — terug te vinden onder Gerapporteerd");
      setOpen(null);
      await onRefresh();
    } else {
      toast.error("Kon niet markeren als gerapporteerd");
    }
  }

  // Brand-new GBP rows have no stored link (Google's API provides none) — the
  // link route resolves the exact Maps URL live from Outscraper, then opens it.
  async function openAndResolve() {
    setBusy("open");
    try {
      const res = await fetch(`/api/reviews/${r.id}/link`);
      window.open(res.url, "_blank", "noopener,noreferrer");
      if (!done && needsReport(r)) void markReported();
    } catch {
      window.open(publicReviewLink(r.reviewUrl), "_blank", "noopener,noreferrer");
    }
    setBusy(null);
  }

  async function aiDraft() {
    setBusy("ai");
    try {
      const res = await fetch(`/api/reviews/${r.id}/ai-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: r.comment,
          rating: r.starRating,
          reviewerName: r.reviewerName,
        }),
      });
      const d = await res.json();
      if (d.draft) {
        setReplyText(d.draft);
        toast.success("Suggestie klaar — pas aan waar nodig en verstuur");
      } else {
        toast.error("Geen suggestie beschikbaar");
      }
    } catch {
      toast.error("Verbindingsfout");
    }
    setBusy(null);
  }

  async function followUp(stillUp: boolean) {
    setBusy("follow");
    const updated = stillUp
      ? await patchReview(r.id, { followup: true })
      : await patchReview(r.id, { reportOutcome: "removed" });
    setBusy(null);
    if (updated) {
      toast.success(stillUp ? "Genoteerd — over 3 dagen kijken we opnieuw" : "Top! De review is weg");
      setOpen(null);
      await onRefresh();
    } else {
      toast.error("Kon niet opslaan");
    }
  }

  const badge = needsFollow(r)
    ? { label: "Opvolgen", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" }
    : needsReport(r)
      ? { label: "Rapporteren", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" }
      : { label: "Te beantwoorden", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" };

  return (
    <Card
      className={`overflow-hidden border transition-all duration-500 ${
        done ? "border-emerald-500/25 opacity-60" : "border-border hover:border-border/80"
      }`}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {done && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
            <StarChip rating={r.starRating} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{r.reviewerName}</p>
              <p className="text-xs text-muted-foreground">{timeAgo(r.createTime)}</p>
            </div>
          </div>
          {!done && <Badge className={`border text-[10px] shrink-0 ${badge.cls}`}>{badge.label}</Badge>}
        </div>

        {r.comment && (
          <div className="mt-3">
            <p
              className={`text-sm text-muted-foreground whitespace-pre-line ${
                showMore ? "" : "line-clamp-3"
              }`}
            >
              {r.comment}
            </p>
            {r.comment.length > 200 && (
              <button
                onClick={() => setShowMore((v) => !v)}
                className="mt-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
              >
                {showMore ? "Minder lezen" : "Meer lezen"}
              </button>
            )}
          </div>
        )}

        {/* The 3 friendly buttons — nothing else. Opening the review on Google
            IS the report action for unreported ones: the member reports on
            Maps (there is no report API) and we track the outcome from the
            moment they opened it. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {r.reviewUrl ? (
            <a
              href={publicReviewLink(r.reviewUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (!done && needsReport(r) && busy !== "report") void markReported();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open op Google
            </a>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 bg-sky-600 text-white hover:bg-sky-500"
              onClick={openAndResolve}
              disabled={busy === "open"}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {busy === "open" ? "Even zoeken…" : "Open op Google"}
            </Button>
          )}
          {!done && needsReply(r) && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => setOpen(open === "reply" ? null : "reply")}
            >
              <Pencil className="h-3.5 w-3.5" />
              Antwoord voorbereiden
            </Button>
          )}
          {!done && needsFollow(r) && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              onClick={() => setOpen(open === "follow" ? null : "follow")}
            >
              <CalendarCheck className="h-3.5 w-3.5" />
              Opvolgen
            </Button>
          )}
        </div>

        {!done && needsReport(r) && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            Open op Google meldt deze review automatisch — rapporteer hem daar en wij volgen het
            resultaat.
          </p>
        )}

        {/* Reply panel */}
        {open === "reply" && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 space-y-2 animate-fade-in">
            <p className="text-xs text-muted-foreground">
              Schrijf een vriendelijk antwoord — dit komt onder de review op Google.
            </p>
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Bedankt voor je feedback…"
              className="min-h-[90px] text-sm"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={aiDraft}
                disabled={busy === "ai" || busy === "reply"}
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                {busy === "ai" ? "Schrijft…" : "AI-suggestie"}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={sendReply} disabled={busy === "reply" || !replyText.trim()}>
                <Send className="h-3.5 w-3.5" />
                {busy === "reply" ? "Bezig…" : "Verzenden"}
              </Button>
            </div>
          </div>
        )}

        {/* Follow-up panel — the 3-day check after a report */}
        {open === "follow" && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-2 animate-fade-in">
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              Tijd om te kijken: staat de review nog op Google?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => followUp(true)}
                disabled={busy === "follow"}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Nog zichtbaar — blijft gerapporteerd
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                onClick={() => followUp(false)}
                disabled={busy === "follow"}
              >
                <PartyPopper className="h-3.5 w-3.5" />
                De review is weg!
              </Button>
            </div>
          </div>
        )}

        {r.replyText && done && (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Jouw antwoord</p>
            <p className="text-xs text-muted-foreground whitespace-pre-line">{r.replyText}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemberView({ payload, onRefresh }: { payload: GroupsPayload; onRefresh: () => Promise<void> }) {
  // The deck is SHARED — every member sees the same list (see sharedDeck in
  // lib/review-groups). "done" is this member's own report ledger.
  const tasks = payload.tasks ?? [];
  const todo = tasks;
  const done = payload.myDone ?? [];
  const firstName = (payload.me.name || "daar").split(" ")[0];
  const today = new Date().toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Swipe deck state — one review at a time instead of a long scroll.
  const [idx, setIdx] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animDir, setAnimDir] = useState<1 | -1 | 0>(0);
  const [view, setView] = useState<"taken" | "reported">("taken");
  const startX = useRef(0);
  const current = todo[idx] ?? null;

  // Apple-style section paging: "melden" (bad reviews) ⇄ "antwoorden"
  // (positive reviews). Swiping the page scrolls the snap container; the
  // segmented control scrolls it programmatically.
  const [section, setSection] = useState<"melden" | "antwoorden">("melden");
  const pagesRef = useRef<HTMLDivElement>(null);
  const positive = payload.positive ?? [];

  function onPagesScroll() {
    const el = pagesRef.current;
    if (!el) return;
    setSection(el.scrollLeft > el.clientWidth / 2 ? "antwoorden" : "melden");
  }

  function switchSection(s: "melden" | "antwoorden") {
    const el = pagesRef.current;
    if (!el) {
      setSection(s);
      return;
    }
    el.scrollTo({ left: s === "antwoorden" ? el.clientWidth : 0, behavior: "smooth" });
  }

  // Keep the index valid when the pile shrinks (e.g. after an action).
  useEffect(() => {
    if (todo.length === 0) return;
    setIdx((i) => Math.min(i, todo.length - 1));
  }, [todo.length]);

  function go(dir: 1 | -1) {
    if (animDir !== 0) return;
    const next = idx + dir;
    if (next < 0 || next >= todo.length) return;
    setAnimDir(dir);
    window.setTimeout(() => {
      setIdx(next);
      setAnimDir(0);
      setDrag(0);
    }, 170);
  }

  // Keyboard arrows for desktop.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (animDir !== 0) return;
    // Never start a swipe from a button/link/input — taps on those must keep
    // working normally (clicks, focus, navigation).
    const t = e.target as HTMLElement;
    if (t.closest("button, a, input, textarea, select")) return;
    setDragging(true);
    startX.current = e.clientX;
  }

  // Track the drag on window (no pointer capture — capture would swallow
  // every click on the buttons inside the card).
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setDrag(e.clientX - startX.current);
    const up = (e: PointerEvent) => {
      setDragging(false);
      const dx = e.clientX - startX.current;
      if (dx > 70) go(-1);
      else if (dx < -70) go(1);
      else setDrag(0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const cardTransform = dragging
    ? `translateX(${drag}px)`
    : animDir !== 0
      ? `translateX(${animDir * -110}%)`
      : "translateX(0)";

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight">
          <Hand className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
          Hallo {firstName}, dit is wat jij vandaag moet doen
        </h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">
          {payload.group ? `${payload.group.name} · ` : ""}
          {today}
        </p>
      </div>

      {/* Section switch — Apple-style: swipe the page, or tap. */}
      <div className="flex rounded-xl border border-border bg-muted/40 p-1">
        <button
          onClick={() => switchSection("melden")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            section === "melden" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Flag className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Melden
          {todo.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {todo.length}
            </span>
          )}
        </button>
        <button
          onClick={() => switchSection("antwoorden")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            section === "antwoorden" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Antwoorden
          {positive.length > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {positive.length}
            </span>
          )}
        </button>
      </div>
      </div>

      {/* Apple-style paging: swipe the page sideways to switch sections. The
          deck keeps touch-pan-y, so a horizontal drag on a card stays a
          card-drag while a drag anywhere else pages the sections. */}
      <div
        ref={pagesRef}
        onScroll={onPagesScroll}
        className="mt-5 flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4"
      >
        <section className="w-full shrink-0 snap-center pr-5 space-y-5">

      {/* Tabs: work to do vs. what got reported this week */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setView("taken")}
          className={`flex items-center gap-1.5 pb-2 -mb-px text-sm font-semibold border-b-2 transition-colors ${
            view === "taken"
              ? "border-sky-400 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Mijn taken
          {todo.length > 0 && (
            <span className="rounded-full bg-sky-500/15 px-1.5 text-[11px] font-bold text-sky-600 dark:text-sky-400 tabular-nums">
              {todo.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setView("reported")}
          className={`flex items-center gap-1.5 pb-2 ml-5 -mb-px text-sm font-semibold border-b-2 transition-colors ${
            view === "reported"
              ? "border-emerald-400 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Gerapporteerd
          {done.length > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {done.length}
            </span>
          )}
        </button>
      </div>

      {view === "taken" && (
        <>
          {/* The big friendly counter */}
      <Card className="border-border bg-gradient-to-br from-sky-500/10 via-transparent to-transparent">
        <CardContent className="p-5 sm:p-6 text-center">
          {todo.length > 0 ? (
            <>
              <p className="text-4xl sm:text-5xl font-bold text-sky-600 dark:text-sky-400">{todo.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {todo.length === 1 ? "review om te behandelen" : "reviews om te behandelen"} — doe
                ze rustig één voor één
              </p>
            </>
          ) : (
            <>
              <PartyPopper className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              <p className="mt-2 text-sm text-muted-foreground">
                Alles gedaan — je bent klaar voor vandaag!
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* My reports this week */}
      {done.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{done.length}</span> gerapporteerd
          door jou deze week
        </p>
      )}

      {todo.length === 0 && (
        <Card className="border-border">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Er zijn momenteel geen slechte reviews om te behandelen.
          </CardContent>
        </Card>
      )}

      {/* The swipe deck — one card at a time */}
      {current && (
        <div className="relative touch-pan-y select-none" onPointerDown={onPointerDown}>
          <div
            key={current.assignmentId}
            style={{
              transform: cardTransform,
              transition: dragging ? "none" : "transform 170ms ease-out, opacity 170ms ease-out",
              opacity: animDir !== 0 ? 0.5 : 1,
            }}
          >
            <MemberCard task={current} onRefresh={onRefresh} />
          </div>
        </div>
      )}

      {/* Deck controls */}
      {todo.length > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-full shrink-0"
            onClick={() => go(-1)}
            disabled={idx === 0}
            aria-label="Vorige review"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            {todo.length <= 12 ? (
              todo.map((t, i) => (
                <button
                  key={t.assignmentId}
                  onClick={() => setIdx(i)}
                  aria-label={`Review ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === idx ? "w-6 bg-sky-400" : "w-1.5 bg-muted-foreground/30"
                  }`}
                />
              ))
            ) : (
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {idx + 1} / {todo.length}
              </span>
            )}
          </div>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-full shrink-0"
            onClick={() => go(1)}
            disabled={idx >= todo.length - 1}
            aria-label="Volgende review"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {todo.length > 1 && (
        <p className="text-center text-[11px] text-muted-foreground -mt-2">
          Veeg naar links of rechts om te wisselen
        </p>
      )}

      {/* Done today — compact chips instead of full cards */}
      {done.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-border" />
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <PartyPopper className="h-3.5 w-3.5" />
              Gerapporteerd door jou ({done.length})
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {done.map((t) => (
              <div
                key={t.assignmentId}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="max-w-[140px] truncate">{t.review.reviewerName}</span>
              </div>
            ))}
          </div>
        </>
      )}
        </>
      )}

      {/* Reported this week — full details instead of the compact chips */}
      {view === "reported" && (
        <div className="space-y-3">
          {done.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Deze week is er nog niets gerapporteerd.
              </CardContent>
            </Card>
          ) : (
            done.map((t) => {
              const r = t.review;
              return (
                <Card key={t.assignmentId} className="border-emerald-500/25">
                  <CardContent className="p-4 sm:p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        <StarChip rating={r.starRating} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{r.reviewerName}</p>
                          <p className="text-xs text-muted-foreground">
                            Gemeld {timeAgo(r.reportedAt)}
                          </p>
                        </div>
                      </div>
                      <a
                        href={publicReviewLink(r.reviewUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </a>
                    </div>
                    {r.comment && (
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{r.comment}</p>
                    )}
                    {r.followUpAt && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
                        Volgende controle:{" "}
                        {new Date(r.followUpAt).toLocaleDateString("nl-BE", {
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
        </section>

        {/* POSITIVE REVIEWS — reply with AI help, posted straight to Google */}
        <section className="w-full shrink-0 snap-center pl-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight">
              <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              Positieve reviews
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Bedank klanten met een persoonlijk antwoord — het verschijnt meteen op Google.
            </p>
          </div>
          {positive.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Er zijn momenteel geen positieve reviews om te beantwoorden.
              </CardContent>
            </Card>
          ) : (
            positive.map((t) => (
              <MemberCard key={t.assignmentId} task={t} onRefresh={onRefresh} />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// LEAD VIEW — "Team Overzicht"
// ═══════════════════════════════════════════

function LeadView({ payload, onRefresh }: { payload: GroupsPayload; onRefresh: () => Promise<void> }) {
  const group = payload.group;
  const members = payload.members ?? [];
  // Everyone sees the same shared deck, so the totals are the deck size
  // (same per member) and the reports done by this group's members.
  const total = members[0]?.total ?? 0;
  const done = members.reduce((s, m) => s + m.done, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-fade-in">
      {/* A lead does the same work as everyone else — the same shared deck. */}
      <MemberView payload={payload} onRefresh={onRefresh} />

      <div className="h-px bg-border" />

      {/* Team insights — the extra info a lead gets on top. */}
      <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight">
            <Users className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
            {group?.name ?? "Team"} — Overzicht
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Iedereen ziet dezelfde lijst slechte reviews — hier zie je wie deze week
            gerapporteerd heeft.
          </p>
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Samen deze week</span>
            <span className="font-semibold">
              {done} van {total} gerapporteerd
            </span>
          </div>
          <ProgressBar value={total > 0 ? (done / total) * 100 : 0} className="mt-2" />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const pct = m.total > 0 ? (m.done / m.total) * 100 : 0;
          return (
            <Card key={m.id} className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <span className="text-sm font-semibold">{m.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{m.name}</p>
                      {m.total > 0 && m.done === m.total && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {m.total === 0
                        ? "Nog geen taken deze week"
                        : `${m.done} van ${m.total} gedaan · ${Math.round(pct)}%`}
                    </p>
                  </div>
                </div>
                {m.total > 0 && <ProgressBar value={pct} className="mt-3" />}
              </CardContent>
            </Card>
          );
        })}
        {members.length === 0 && (
          <Card className="border-border sm:col-span-2">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nog geen teamleden in {group?.name ?? "dit team"} — voeg leden toe via de Team-pagina.
            </CardContent>
          </Card>
        )}
      </div>

      </section>
    </div>
  );
}

// ═══════════════════════════════════════════
// ADMIN VIEW — the simplified command center
// ═══════════════════════════════════════════

type AdminFilter = "alle" | "antwoorden" | "verdacht" | "gerapporteerd" | "verwijderaar" | "verwijderd";

const FILTER_LABELS: Record<AdminFilter, string> = {
  alle: "Alle reviews",
  antwoorden: "Te beantwoorden",
  verdacht: "Verdacht",
  gerapporteerd: "Gerapporteerd",
  verwijderaar: "Bij de verwijderaar",
  verwijderd: "Verwijderd",
};

function AdminRow({ review, onUpdate }: { review: Review; onUpdate: (r: Review) => void }) {
  const [open, setOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; action: string; detail: string | null; actorId: string | null; createdAt: string }[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [caseId, setCaseId] = useState(review.reportCaseId ?? "");
  const [notes, setNotes] = useState(review.notes ?? "");
  const [price, setPrice] = useState("15");

  const r = review;
  const suspicious = isSuspiciousLocal(r);

  async function sendReply() {
    if (!replyText.trim()) return;
    setBusy("reply");
    try {
      const res = await fetch(`/api/reviews/${r.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(d.google ? "Antwoord staat live op Google" : "Antwoord opgeslagen — wordt automatisch live gezet");
        onUpdate(d.review as Review);
        setReplyText("");
      } else toast.error("Kon het antwoord niet opslaan");
    } catch {
      toast.error("Verbindingsfout");
    }
    setBusy(null);
  }

  // Same Quicksolutions-trained draft the member cards use — the owner used to
  // have to write every reply from scratch in this view.
  async function aiDraft() {
    setBusy("ai");
    try {
      const res = await fetch(`/api/reviews/${r.id}/ai-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: r.comment,
          rating: r.starRating,
          reviewerName: r.reviewerName,
        }),
      });
      const d = await res.json();
      if (d.draft) {
        setReplyText(d.draft);
        toast.success("Suggestie klaar — pas aan waar nodig en verstuur");
      } else {
        toast.error("Geen suggestie beschikbaar");
      }
    } catch {
      toast.error("Verbindingsfout");
    }
    setBusy(null);
  }

  async function patch(body: Record<string, unknown>, okMsg: string) {
    setBusy("patch");
    const updated = await patchReview(r.id, body);
    setBusy(null);
    if (updated) {
      toast.success(okMsg);
      onUpdate(updated);
    } else toast.error("Kon niet opslaan");
  }

  async function removal(stage: string, body: Record<string, unknown> = {}) {
    setBusy("removal");
    try {
      const res = await fetch(`/api/reviews/${r.id}/removal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, ...body }),
      });
      if (res.ok) {
        toast.success("Verwijderaar bijgewerkt");
        onUpdate((await res.json()).review as Review);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Verwijderaar-actie mislukt");
      }
    } catch {
      toast.error("Verbindingsfout");
    }
    setBusy(null);
  }

  async function loadHistory() {
    setShowHistory(true);
    if (history) return;
    try {
      const res = await fetch(`/api/reviews/${r.id}/actions`);
      if (res.ok) setHistory((await res.json()).actions);
    } catch {}
  }

  const overdue =
    r.removalStage === "sent" && r.removalDueAt && new Date(r.removalDueAt).getTime() < Date.now();

  return (
    <Card id={`review-${r.id}`} className="overflow-hidden border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-3 sm:p-3.5 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <StarChip rating={r.starRating} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm font-semibold truncate">{r.reviewerName}</span>
              <span className="text-xs text-muted-foreground shrink-0">{timeAgo(r.createTime)}</span>
            </div>
            {r.comment && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{r.comment}</p>
            )}
          </div>
          <div className="flex max-w-[45%] shrink-0 items-center gap-1 flex-wrap justify-end">
            {suspicious && (
              <Badge className="border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                Verdacht
              </Badge>
            )}
            {r.reported && (
              <Badge className="border bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px]">
                Gerapporteerd
              </Badge>
            )}
            {r.removalStage && (
              <Badge className="border bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30 text-[10px]">
                {STAGE_NL[r.removalStage] ?? "Verwijderaar"}
              </Badge>
            )}
            {r.editedAt && (
              <Badge className="border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                Bewerkt ×{Math.max(1, r.editCount)}
              </Badge>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4 animate-fade-in">
          {r.comment && <p className="text-sm whitespace-pre-line">{r.comment}</p>}

          <div className="flex flex-wrap gap-2">
            <a
              href={publicReviewLink(r.reviewUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open op Google
            </a>
          </div>

          {/* ── Antwoord ── */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400">
              <Pencil className="h-3.5 w-3.5" />
              Antwoord
            </p>
            {r.replyText ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                <p className="text-xs text-muted-foreground whitespace-pre-line">{r.replyText}</p>
                {r.replyPending && (
                  <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <RefreshCw className="h-3 w-3 shrink-0" />
                    Nog niet live op Google (quota) — wordt automatisch geplaatst bij de volgende sync.
                  </p>
                )}
              </div>
            ) : (
              <>
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Antwoord schrijven…"
                  className="min-h-[70px] text-sm"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={aiDraft}
                    disabled={busy === "ai" || busy === "reply"}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    {busy === "ai" ? "Schrijft…" : "AI-suggestie"}
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={sendReply} disabled={busy === "reply" || !replyText.trim()}>
                    <Send className="h-3.5 w-3.5" />
                    {busy === "reply" ? "Bezig…" : "Verzenden"}
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* ── Rapportage ── */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Flag className="h-3.5 w-3.5" />
              Rapportage bij Google
            </p>
            {!r.reported ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Rapporteer op Google Maps en markeer hier — het dashboard volgt het resultaat automatisch op.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  onClick={() => patch({ reported: true }, "Gerapporteerd — opvolging gepland")}
                  disabled={busy === "patch"}
                >
                  <Flag className="h-3.5 w-3.5" />
                  Markeer gerapporteerd
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge className="border bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30">
                    {r.reportOutcome ? OUTCOME_NL[r.reportOutcome] ?? r.reportOutcome : "In afwachting"}
                  </Badge>
                  {r.reportCount > 1 && (
                    <span className="text-muted-foreground">{r.reportCount}× gerapporteerd</span>
                  )}
                  {r.followUpAt && (
                    <span className="text-muted-foreground">
                      Volgende check: {new Date(r.followUpAt).toLocaleDateString("nl-BE")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                    onClick={() => patch({ reportOutcome: "removed" }, "Uitkomst: verwijderd")}
                    disabled={busy === "patch"}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verwijderd
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => patch({ reportOutcome: "still_up" }, "Uitkomst: nog online")}
                    disabled={busy === "patch"}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Staat er nog
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => patch({ reportOutcome: "rejected" }, "Uitkomst: afgewezen")}
                    disabled={busy === "patch"}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Afgewezen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => patch({ followup: true }, "Opnieuw gecontroleerd — volgende check over 3 dagen")}
                    disabled={busy === "patch"}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Opnieuw gecontroleerd
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <div className="flex-1 min-w-[180px] space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Google case-nummer</Label>
                    <Input
                      value={caseId}
                      onChange={(e) => setCaseId(e.target.value)}
                      placeholder="bv. 1-9254000041462"
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="self-end h-8 text-xs"
                    onClick={() => patch({ reportCaseId: caseId }, "Case-nummer opgeslagen")}
                    disabled={busy === "patch"}
                  >
                    Opslaan
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* ── Verwijderaar ── */}
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400">
              <Banknote className="h-3.5 w-3.5" />
              Verwijderaar (betaalde service)
            </p>
            {r.removalStage === null && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-violet-500/40 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
                onClick={() => removal("ready")}
                disabled={busy === "removal"}
              >
                Klaar voor verwijdering
              </Button>
            )}
            {r.removalStage === "ready" && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  type="number"
                  min="0"
                  className="h-8 w-20 text-xs"
                />
                <Button
                  size="sm"
                  className="text-xs bg-violet-600 hover:bg-violet-500"
                  onClick={() => removal("send", { price })}
                  disabled={busy === "removal"}
                >
                  <Banknote className="h-3.5 w-3.5 mr-1" />
                  Verzenden €{price || "0"}
                </Button>
              </div>
            )}
            {r.removalStage === "sent" && (
              <p className="text-xs text-muted-foreground">
                Verzonden {r.removalPrice != null ? `voor €${r.removalPrice}` : ""} — deadline{" "}
                {r.removalDueAt ? new Date(r.removalDueAt).toLocaleDateString("nl-BE") : "—"}
                {overdue && <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">TE LAAT!</span>}
              </p>
            )}
            {r.removalStage === "removed" && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Verwijderd {r.removalPrice != null ? `— te betalen €${r.removalPrice}` : ""}
                </p>
                {!r.paidAt && (
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500"
                    onClick={() => removal("paid")}
                    disabled={busy === "removal"}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Betaald
                  </Button>
                )}
              </div>
            )}
            {r.removalStage !== null && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-muted-foreground"
                onClick={() => removal("cancel")}
                disabled={busy === "removal"}
              >
                Uit pijplijn halen
              </Button>
            )}
          </div>

          {/* ── Notities + geschiedenis ── */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5" />
              Notities (alleen voor het team)
            </p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interne notitie…"
              className="min-h-[50px] text-sm"
            />
            <div className="flex justify-between items-center">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => patch({ notes }, "Notitie opgeslagen")}
                disabled={busy === "patch"}
              >
                Opslaan
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={loadHistory}>
                <History className="h-3.5 w-3.5" />
                Geschiedenis
              </Button>
            </div>
            {showHistory && (
              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                {history === null ? (
                  <Skeleton className="h-4 w-full" />
                ) : history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nog geen acties.</p>
                ) : (
                  history.map((a) => (
                    <p key={a.id} className="text-[11px] text-muted-foreground">
                      <span className="text-foreground/80">{ACTION_LABELS[a.action] ?? a.action}</span>
                      {a.detail ? ` — ${a.detail}` : ""} · {timeAgo(a.createdAt)}
                    </p>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function AdminView({
  payload,
  reviews,
  avg,
  lastSync,
  connected,
  onRefresh,
  onUpdateReview,
  highlightId,
  syncing,
  setSyncing,
}: {
  payload: GroupsPayload;
  reviews: Review[];
  avg: number | null;
  lastSync: SyncLog | null;
  connected: boolean | null;
  onRefresh: () => Promise<void>;
  onUpdateReview: (updated: Review) => void;
  highlightId?: string | null;
  syncing: boolean;
  setSyncing: (v: boolean) => void;
}) {
  const [filter, setFilter] = useState<AdminFilter>("alle");
  const [query, setQuery] = useState("");
  const [starFilter, setStarFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  // The owner has the same two shifts as the review team: manage the bad pile,
  // or answer the good reviews. Only the team used to have the second one.
  const [view, setView] = useState<"beheer" | "positief">("beheer");
  const positive = payload.positive ?? [];

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addRating, setAddRating] = useState("1");
  const [addComment, setAddComment] = useState("");
  const [adding, setAdding] = useState(false);
  const [digestText, setDigestText] = useState<string | null>(null);
  const [digesting, setDigesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const active = reviews.filter((r) => r.status === "active");
  const unanswered = active.filter((r) => !r.replyText && !r.replyPending);
  const suspiciousList = active.filter(isSuspiciousLocal);
  const reportedList = active.filter((r) => r.reported);
  const removalList = reviews.filter((r) => r.removalStage !== null);
  const dueFollowUps = reportedList.filter(
    (r) => r.followUpAt && new Date(r.followUpAt).getTime() <= Date.now()
  );
  const overdueRemoval = removalList.filter(
    (r) => r.removalStage === "sent" && r.removalDueAt && new Date(r.removalDueAt).getTime() < Date.now()
  );

  function updateReview(updated: Review) {
    onUpdateReview(updated);
  }

  // Deep-link from the activity feed (?highlight=<reviewId>): reset filters,
  // jump to the right page, scroll to the row.
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`review-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const idx = reviews.findIndex((r) => r.id === highlightId);
    if (idx >= 0) {
      setFilter("alle");
      setQuery("");
      setStarFilter("all");
      setPage(Math.floor(idx / PAGE_SIZE) + 1);
    }
  }, [highlightId, reviews, filter, page]);

  let filtered: Review[];
  switch (filter) {
    case "antwoorden":
      filtered = unanswered;
      break;
    case "verdacht":
      filtered = suspiciousList;
      break;
    case "gerapporteerd":
      filtered = reportedList;
      break;
    case "verwijderaar":
      filtered = removalList;
      break;
    case "verwijderd":
      filtered = reviews.filter((r) => r.status === "removed");
      break;
    default:
      filtered = reviews;
  }
  if (starFilter !== "all") {
    filtered = filtered.filter((r) => r.starRating === Number(starFilter));
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.reviewerName.toLowerCase().includes(q) ||
        (r.comment ?? "").toLowerCase().includes(q)
    );
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const shown = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function pickFilter(f: AdminFilter) {
    setFilter(f);
    setQuery("");
    setStarFilter("all");
    setPage(1);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/reviews/sync", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ? `Sync mislukt: ${d.error}` : "Sync mislukt");
      } else {
        toast.success("Sync gedaan");
      }
      await onRefresh();
    } catch {
      toast.error("Sync mislukt");
    }
    setSyncing(false);
  }

  async function connectGoogle() {
    const res = await fetch("/api/google/auth-url");
    if (res.ok) window.location.href = (await res.json()).url;
    else toast.error("Kon Google-koppeling niet starten");
  }

  async function addManual() {
    if (!addComment.trim() && !addName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerName: addName, starRating: Number(addRating), comment: addComment }),
      });
      if (res.ok) {
        toast.success("Review toegevoegd");
        setShowAdd(false);
        setAddName("");
        setAddComment("");
        setAddRating("1");
        await onRefresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Fout bij toevoegen");
      }
    } catch {
      toast.error("Verbindingsfout");
    }
    setAdding(false);
  }

  async function runDigest() {
    setDigesting(true);
    try {
      const res = await fetch("/api/reviews/digest", { method: "POST" });
      if (res.ok) {
        setDigestText((await res.json()).text);
      } else {
        toast.error("Digest mislukt");
      }
    } catch {
      toast.error("Verbindingsfout");
    }
    setDigesting(false);
  }

  async function importCsv(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/reviews/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(`CSV verwerkt: ${d.created} nieuw, ${d.updated} bijgewerkt`);
        await onRefresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Import mislukt");
      }
    } catch {
      toast.error("Import mislukt");
    }
    setImporting(false);
  }

  const statCards = [
    { label: "actief", value: active.length, cls: "text-sky-600 dark:text-sky-400" },
    { label: "te beantwoorden", value: unanswered.length, cls: "text-sky-600 dark:text-sky-400" },
    { label: "verdacht", value: suspiciousList.length, cls: "text-amber-600 dark:text-amber-400" },
    { label: "gerapporteerd", value: reportedList.length, cls: "text-rose-600 dark:text-rose-400" },
    { label: "verwijderaar", value: removalList.length, cls: "text-violet-600 dark:text-violet-400" },
    { label: "niet toegewezen", value: payload.unassigned ?? 0, cls: "text-muted-foreground" },
  ];

  const priorities = [
    {
      Icon: MessageSquare,
      label: "wachten op een antwoord",
      count: unanswered.length,
      filter: "antwoorden" as AdminFilter,
      cls: "text-sky-600 dark:text-sky-400",
    },
    {
      Icon: Flag,
      label: "verdacht, te rapporteren",
      count: suspiciousList.filter((r) => !r.reported).length,
      filter: "verdacht" as AdminFilter,
      cls: "text-amber-600 dark:text-amber-400",
    },
    {
      Icon: CalendarCheck,
      label: "opvolgen op Google",
      count: dueFollowUps.length,
      filter: "gerapporteerd" as AdminFilter,
      cls: "text-rose-600 dark:text-rose-400",
    },
    {
      Icon: Banknote,
      label: "bij de verwijderaar",
      count: removalList.length,
      filter: "verwijderaar" as AdminFilter,
      cls: "text-violet-600 dark:text-violet-400",
    },
  ];

  const firstName = (payload.me.name || "Owner").split(" ")[0];
  const actionPoints = priorities.reduce((sum, p) => sum + p.count, 0);
  const today = new Date().toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header — same design language as the member view */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight">
            <Hand className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
            Hallo {firstName}, dit is jouw dag
          </h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            {today} · laatste sync {lastSync?.finishedAt ? timeAgo(lastSync.finishedAt) : "…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={syncNow} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sync…" : "Sync"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline" className="gap-1" aria-label="Meer acties" />
              }
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              Meer
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {connected === false && (
                <DropdownMenuItem onClick={connectGoogle}>
                  Google verbinden
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5" />
                Handmatig toevoegen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileRef.current?.click()} disabled={importing}>
                <Upload className="h-3.5 w-3.5" />
                {importing ? "Bezig…" : "CSV importeren"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={runDigest} disabled={digesting}>
                <FileText className="h-3.5 w-3.5" />
                {digesting ? "Bezig…" : "Wekelijks rapport"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCsv(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Two shifts: manage the bad pile, or answer the good reviews */}
      <div className="flex rounded-xl border border-border bg-muted/40 p-1">
        <button
          onClick={() => setView("beheer")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            view === "beheer" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Star className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Alle reviews
        </button>
        <button
          onClick={() => setView("positief")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            view === "positief" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Positieve reviews
          {positive.length > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {positive.length}
            </span>
          )}
        </button>
      </div>

      {view === "positief" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Bedank klanten met een persoonlijk antwoord — met AI-suggestie, meteen live op Google.
          </p>
          {positive.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Er zijn momenteel geen positieve reviews om te beantwoorden.
              </CardContent>
            </Card>
          ) : (
            positive.map((t) => (
              <MemberCard key={t.assignmentId} task={t} onRefresh={onRefresh} />
            ))
          )}
        </div>
      ) : (
        <>
      {/* Hero — the big friendly number, like the member counter */}
      <Card className="border-border bg-gradient-to-br from-sky-500/10 via-transparent to-transparent">
        <CardContent className="p-5 sm:p-6 text-center">
          {actionPoints > 0 ? (
            <>
              <p className="text-4xl sm:text-5xl font-bold text-sky-600 dark:text-sky-400">{actionPoints}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {actionPoints === 1 ? "actiepunt vandaag" : "actiepunten vandaag"}
                {avg != null && <> · gem. {avg}★</>} · {reviews.length} reviews
              </p>
            </>
          ) : (
            <>
              <PartyPopper className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              <p className="mt-2 text-sm text-muted-foreground">
                Alles onder controle — niets dat vandaag dringend moet gebeuren
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* All numbers at a glance — compact scrollable chip strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs"
          >
            <span className={`font-bold tabular-nums ${s.cls}`}>{s.value}</span>
            <span className="text-muted-foreground whitespace-nowrap">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Vandaag prioriteit — big tap cards that jump straight to that filter */}
      {priorities.some((p) => p.count > 0) && (
        <div className="grid gap-2">
          {priorities
            .filter((p) => p.count > 0)
            .map((p) => (
              <button
                key={p.filter}
                onClick={() => pickFilter(p.filter)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left hover:bg-muted/40 transition-colors"
              >
                <span className="text-xl shrink-0">
                  <p.Icon className={`h-5 w-5 ${p.cls}`} />
                </span>
                <span className={`text-xl font-bold tabular-nums w-8 text-center shrink-0 ${p.cls}`}>
                  {p.count}
                </span>
                <span className="text-sm flex-1 min-w-0 truncate">{p.label}</span>
                {p.filter === "verwijderaar" && overdueRemoval.length > 0 && (
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                    {overdueRemoval.length} te laat
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
        </div>
      )}

      {/* Filter dropdown + search (no tabs — one clean row) */}
      <div ref={listTopRef} className="flex flex-wrap items-center gap-2 scroll-mt-24">
        <Select value={filter} onValueChange={(v) => pickFilter(v as AdminFilter)}>
          <SelectTrigger className="w-full sm:w-auto sm:min-w-[190px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FILTER_LABELS) as AdminFilter[]).map((k) => (
              <SelectItem key={k} value={k}>
                {FILTER_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Zoek op naam of tekst…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select
          value={starFilter}
          onValueChange={(v) => {
            setStarFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[120px] ml-auto sm:ml-0 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle sterren</SelectItem>
            {[5, 4, 3, 2, 1].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} sterren
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="space-y-2.5">
        {shown.map((r) => (
          <AdminRow key={r.id} review={r} onUpdate={updateReview} />
        ))}
        {shown.length === 0 && (
          <Card className="border-border">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Geen reviews gevonden voor deze filter.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pager */}
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {filtered.length === 0
              ? "0 reviews"
              : `Toon ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                  safePage * PAGE_SIZE,
                  filtered.length
                )} van ${filtered.length}`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              disabled={safePage <= 1}
              onClick={() => {
                setPage(safePage - 1);
                listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageNumbers(safePage, pageCount).map((p, i) =>
              p === "…" ? (
                <span key={`e${i}`} className="px-1.5 text-xs text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  size="sm"
                  variant={p === safePage ? "default" : "ghost"}
                  className="h-8 w-8 p-0 text-xs"
                  onClick={() => {
                    setPage(p);
                    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {p}
                </Button>
              )
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              disabled={safePage >= pageCount}
              onClick={() => {
                setPage(safePage + 1);
                listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
        </>
      )}

      {/* Handmatig toevoegen dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review handmatig toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Naam</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Anoniem" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sterren</Label>
              <Select value={addRating} onValueChange={(v) => v && setAddRating(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} sterren
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tekst</Label>
              <Textarea
                value={addComment}
                onChange={(e) => setAddComment(e.target.value)}
                className="min-h-[80px] text-sm"
              />
            </div>
            <Button className="w-full" onClick={addManual} disabled={adding}>
              {adding ? "Bezig…" : "Toevoegen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Digest dialog */}
      <Dialog open={!!digestText} onOpenChange={(v) => !v && setDigestText(null)}>
        <DialogContent className="max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Wekelijks rapport</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{digestText}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════
// PAGE — fetch once, then render the right view
// ═══════════════════════════════════════════

function ReviewsPageInner() {
  const searchParams = useSearchParams();
  const googleStatus = searchParams.get("google");
  const highlightId = searchParams.get("highlight");

  const [payload, setPayload] = useState<GroupsPayload | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [groupsRes, reviewsRes, authRes] = await Promise.all([
        fetch("/api/reviews/groups", { cache: "no-store" }),
        fetch("/api/reviews", { cache: "no-store" }),
        fetch("/api/google/auth-url"),
      ]);
      if (groupsRes.ok) {
        setPayload(await groupsRes.json());
      } else {
        setError("Kon jouw taken niet laden");
      }
      if (reviewsRes.ok) {
        const d = await reviewsRes.json();
        setReviews(d.reviews);
        setAvg(d.avg);
        setLastSync(d.lastSync);
      }
      if (authRes.ok) setConnected((await authRes.json()).connected);
    } catch {
      setError("Verbindingsfout");
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 300000);
    return () => clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    if (googleStatus === "ok") toast.success("Google verbonden");
    if (googleStatus === "error") toast.error("Google-verbinding mislukt");
  }, [googleStatus]);

  if (error && !payload) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={loadAll}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Opnieuw proberen
        </Button>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (payload.mode === "member") {
    return <MemberView payload={payload} onRefresh={loadAll} />;
  }

  if (payload.mode === "lead") {
    return <LeadView payload={payload} onRefresh={loadAll} />;
  }

  // admin
  if (!reviews) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return (
    <AdminView
      payload={payload}
      reviews={reviews}
      avg={avg}
      lastSync={lastSync}
      connected={connected}
      onRefresh={loadAll}
      onUpdateReview={(updated) =>
        setReviews((prev) =>
          prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev
        )
      }
      highlightId={highlightId}
      syncing={syncing}
      setSyncing={setSyncing}
    />
  );
}

export default function ReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-28 w-full" />
        </div>
      }
    >
      <ReviewsPageInner />
    </Suspense>
  );
}
