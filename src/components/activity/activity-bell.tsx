"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  AlertTriangle,
  Banknote,
  Bell,
  BellRing,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  FileText,
  Flag,
  FlagOff,
  Link2,
  Megaphone,
  MessageSquareReply,
  Pencil,
  PlusCircle,
  RefreshCw,
  Repeat,
  RotateCcw,
  Send,
  StickyNote,
  Sunrise,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PushControls } from "@/components/pwa/push-controls";

type FeedEvent = {
  id: string;
  type: string;
  text: string;
  detail: string | null;
  time: string;
  href: string;
  actorId: string | null;
};

const ICONS: Record<string, typeof Bell> = {
  reported: Flag,
  unreported: FlagOff,
  outcome_set: CheckCircle2,
  followup_done: RefreshCw,
  note_added: StickyNote,
  reply_posted: MessageSquareReply,
  reply_deleted: Trash2,
  created: PlusCircle,
  removed: EyeOff,
  merged: Link2,
  removal_ready: Send,
  removal_sent: Send,
  removal_paid: Banknote,
  removal_cancelled: XCircle,
  came_back: RotateCcw,
  task_created: ClipboardList,
  edited: Pencil,
  auto_replied: MessageSquareReply,
  case_set: FileText,
  escalated: TrendingUp,
  sync: RefreshCw,
  sync_error: AlertTriangle,
  // System events (ActivityEvent) — the automations layer.
  uptime_down: AlertTriangle,
  uptime_up: CheckCircle2,
  ads_digest: Megaphone,
  briefing: Sunrise,
  task_created_telegram: ClipboardList,
  task_assigned: ClipboardList,
  recurring_created: Repeat,
  recurring_missed: AlarmClock,
  recurring_reminder: BellRing,
  recurring_completed: CheckCircle2,
  telegram_error: AlertTriangle,
};

const TONE: Record<string, string> = {
  came_back: "text-rose-600 dark:text-rose-400",
  edited: "text-amber-600 dark:text-amber-400",
  sync_error: "text-amber-600 dark:text-amber-400",
  removal_paid: "text-emerald-600 dark:text-emerald-400",
  removed: "text-emerald-600 dark:text-emerald-400",
  auto_replied: "text-emerald-600 dark:text-emerald-400",
  created: "text-blue-600 dark:text-blue-400",
  task_assigned: "text-cyan-600 dark:text-cyan-400",
  uptime_down: "text-rose-600 dark:text-rose-400",
  uptime_up: "text-emerald-600 dark:text-emerald-400",
  recurring_missed: "text-rose-600 dark:text-rose-400",
  recurring_reminder: "text-amber-600 dark:text-amber-400",
  recurring_completed: "text-emerald-600 dark:text-emerald-400",
  telegram_error: "text-amber-600 dark:text-amber-400",
};

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "zojuist";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min geleden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} u geleden`;
  return `${Math.floor(h / 24)} d geleden`;
}

// Small two-tone ding via WebAudio — no audio asset needed. Browsers only
// allow sound after a user gesture, so we unlock the context on first click.
let audioCtx: AudioContext | null = null;
function ensureAudio(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}
function playDing() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  (
    [
      [880, 0],
      [1318.5, 0.13],
    ] as const
  ).forEach(([freq, off]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + off);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + off + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0 + off);
    osc.stop(t0 + off + 0.17);
  });
}

// Notification bell: unread badge + activity dropdown. Polls /api/activity
// every 30s; beeps on new events (when this instance is the visible one)
// and fires a browser notification when the tab is in the background.
// `mode` matches the breakpoint slot this instance lives in (desktop top bar
// vs mobile nav) so only the visible one makes noise.
export function ActivityBell({ mode = "desktop" }: { mode?: "desktop" | "mobile" }) {
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("qs-sound") !== "off";
    } catch {
      return true;
    }
  });
  const [notifyPerm] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  const knownRef = useRef<Set<string>>(new Set());
  const firstPollRef = useRef(true);
  const soundRef = useRef(soundOn);
  const notifyRef = useRef(notifyPerm);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    // Read fresh at send time: the permission can be granted later from the
    // push controls, after this component already mounted.
    notifyRef.current =
      typeof Notification !== "undefined" ? Notification.permission : "denied";
  }, [notifyPerm]);

  // Unlock audio on the first interaction anywhere (browser autoplay rule).
  useEffect(() => {
    const unlock = () => ensureAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/activity", { cache: "no-store" });
        if (!res.ok) return;
        const data: { events: FeedEvent[]; unread: number; me: string | null } =
          await res.json();
        if (cancelled) return;

        const fresh = data.events.filter((e) => !knownRef.current.has(e.id));
        const first = firstPollRef.current;
        firstPollRef.current = false;
        knownRef.current = new Set(data.events.map((e) => e.id));
        setEvents(data.events);
        setUnread(data.unread);

        // First poll only warms up — don't beep for things that already happened.
        if (first) return;
        const noteworthy = fresh.filter((e) => e.actorId !== data.me);
        if (noteworthy.length === 0) return;
        const visibleHere =
          mode === "desktop"
            ? window.matchMedia("(min-width: 1024px)").matches
            : !window.matchMedia("(min-width: 1024px)").matches;
        if (!visibleHere) return;

        const main = noteworthy[0];
        if (document.hidden) {
          if (notifyRef.current === "granted") {
            try {
              new Notification("QuickSolutions", {
                body:
                  noteworthy.length > 1
                    ? `${main.text} (+${noteworthy.length - 1} meer)`
                    : main.text,
              });
            } catch {
              // Notification API unavailable — badge still updates.
            }
          }
        } else if (soundRef.current) {
          playDing();
        }
      } catch {
        // Network hiccup — next poll retries.
      }
    };
    void poll();
    const t = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [mode]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    // Seen = no beep later; read state is only cleared via "Alles gelezen".
    if (next) knownRef.current = new Set(events.map((e) => e.id));
  };

  const markAllRead = async () => {
    setUnread(0);
    try {
      await fetch("/api/activity/read", { method: "POST" });
    } catch {
      // Best effort — unread badge is already cleared locally.
    }
  };

  const toggleSound = () => {
    setSoundOn((s) => {
      const next = !s;
      try {
        localStorage.setItem("qs-sound", next ? "on" : "off");
      } catch {
        // Private mode etc. — sound just won't persist.
      }
      return next;
    });
    if (!soundOn) playDing(); // audible confirmation when turning it on
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={toggleOpen}
        aria-label="Meldingen"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[min(92vw,380px)] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-sm font-semibold">Activiteit</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleSound}
                  title={soundOn ? "Geluid uit" : "Geluid aan"}
                >
                  {soundOn ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Web push — new-review notifications on the phone (see
                components/pwa/push-controls). */}
            <div className="border-b border-border px-4 py-3">
              <PushControls compact />
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {events.length === 0 ? (
                <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                  Nog geen activiteit.
                </p>
              ) : (
                events.map((e) => {
                  const Icon = ICONS[e.type] ?? Bell;
                  return (
                    <button
                      key={e.id}
                      onClick={() => {
                        router.push(e.href);
                        setOpen(false);
                      }}
                      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/60 text-left"
                    >
                      <Icon
                        className={`h-4 w-4 mt-0.5 shrink-0 ${TONE[e.type] ?? "text-muted-foreground"}`}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-snug">{e.text}</p>
                        {e.detail && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            {e.detail}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {timeAgo(e.time)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-border p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={markAllRead}
                disabled={unread === 0}
              >
                Alles gelezen
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
