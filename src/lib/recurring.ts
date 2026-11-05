// Local-time helpers for the recurring-task sweep and the scheduled digests.
//
// pg_cron runs on UTC and Vercel's server clock is UTC, so "today" and "it is
// now past the 15:00 deadline" can never be answered with Date#getHours() —
// that would fire the blogpost reminder at 17:00 in summer. Everything local
// goes through Intl with the business timezone instead.

export const TZ = "Europe/Brussels";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface BrusselsNow {
  /** YYYY-MM-DD in Brussels. */
  date: string;
  /** Minutes since local midnight (15:00 → 900). */
  minutes: number;
  /** ISO weekday, 1 = monday … 7 = sunday. */
  isoDay: number;
}

export function brusselsNow(at: Date = new Date()): BrusselsNow {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(at)) p[part.type] = part.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  return {
    date,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    isoDay: isoDayOf(date),
  };
}

/** ISO weekday (1 = monday) for a YYYY-MM-DD string. Anchored at UTC noon so
 *  the machine's own timezone can never shift the day. */
export function isoDayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0 = sunday
  return day === 0 ? 7 : day;
}

/** YYYY-MM-DD moved by whole days — pure string arithmetic, no timezone. */
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d, 12) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Local Brussels clock for an absolute moment, as minutes since midnight.
 *  Stored timestamps are UTC; "klaar om 14:12" must be the clock on the wall. */
export function brusselsMinutesOf(at: Date): number {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(at)) p[part.type] = part.value;
  return Number(p.hour) * 60 + Number(p.minute);
}

/** The last moment of the day that still counts as "done in time".
 *
 *  A recurring obligation has a target (the deadline you aim for) and a hard
 *  cut-off. Without one they are the same thing and missing the target is
 *  missing the day. With one — the blogpost aimed at 15:00 but the working day
 *  running to 18:00 — finishing late still turns the day green, and only the
 *  cut-off is allowed to call it missed. */
export function effectiveCutoff(
  deadlineMinutes: number,
  lateUntilMinutes: number | null | undefined
): number {
  return lateUntilMinutes ?? deadlineMinutes;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "15:00" → 900. Returns null for anything that isn't a valid clock time. */
export function parseTimeToMinutes(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Index 0..6 → ISO day 1..7. */
export const DAY_LABELS = ["ma", "di", "wo", "do", "vr", "za", "zo"] as const;

export function dayLabel(isoDay: number): string {
  return DAY_LABELS[isoDay - 1] ?? "?";
}

/** "ma, di, wo, do, vr" — compact day list for messages and the dashboard. */
export function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "elke dag";
  if (sorted.join(",") === "1,2,3,4,5") return "elke werkdag";
  if (sorted.join(",") === "6,7") return "weekend";
  return sorted.map((d) => dayLabel(d)).join(", ");
}

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

// ── English counterparts ──
// The dashboard is Dutch because the client reads it; the Telegram bot is
// Kerim's own cockpit and speaks English. Same date logic, different words.

export const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function dayLabelEN(isoDay: number): string {
  return DAY_LABELS_EN[isoDay - 1] ?? "?";
}

export function describeDaysEN(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "every day";
  if (sorted.join(",") === "1,2,3,4,5") return "every weekday";
  if (sorted.join(",") === "6,7") return "weekends";
  return sorted.map((d) => DAY_LABELS_EN[d - 1]).join(", ");
}

/** en-GB long date for a YYYY-MM-DD string ("Monday 15 September"). */
export function formatISOLongEN(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** nl-BE long date for a YYYY-MM-DD string ("maandag 15 september"). */
export function formatISOLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
