// Review groups, the shared review deck, and the report ledger.
//
// Every non-admin user sees the SAME deck ("Mijn Taken"): due follow-ups plus
// the newest unreported bad reviews (3★ and below). Reporting is something any
// employee does from any phone, so the deck is shared rather than sliced per
// team — the old weekly rotation left half the employees looking at an empty
// "done" screen while bad reviews sat in the other team's pile. Assignment
// rows now only record WHO reported WHAT this week (the "Gerapporteerd" tab
// and the lead overview); ReviewGroup/activeFrom survives for the team page.
//
// No cron needed: every read of /api/reviews/groups runs ensureAssignments(),
// which self-heals the weekly rotation flag and cleans the ledger.

import { db } from "./db";
import type { GoogleReview, ReviewGroup } from "@/generated/prisma/client";

export const ROTATION_DAYS = 7;
// The shared deck's cap — every member sees the same list of at most 15.
export const DECK_LIMIT = 15;

export function currentWeekKey(now = new Date()): string {
  // ISO week, e.g. "2026-W36"
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// What the SHARED deck contains: the bad reviews only.
//  1. reported & follow-up is due  → re-check on Google ("Opvolgen")
//  2. unreported & 3★ or below    → report it ("Rapporteren")
// Every bad review is deck work now, not just the AI-suspicious ones — a
// plain 3★ the AI doesn't flag used to sit unreported forever while members
// saw a false "done for the week".
// Replying to good reviews is NOT team work — the admin answers those from
// the "Te beantwoorden" view and the auto-thanks bot handles the rest.
export function isMemberWork(
  r: Pick<
    GoogleReview,
    "status" | "reported" | "followUpAt" | "aiFakeScore" | "starRating"
  >
): boolean {
  if (r.status !== "active") return false;
  if (r.reported && r.followUpAt && new Date(r.followUpAt).getTime() <= Date.now()) return true;
  return !r.reported && r.starRating <= 3;
}

export async function ensureGroups(): Promise<ReviewGroup[]> {
  let groups = await db.reviewGroup.findMany({ orderBy: { sortOrder: "asc" } });
  if (groups.length === 0) {
    await db.reviewGroup.create({ data: { name: "Team A", sortOrder: 1, activeFrom: new Date() } });
    await db.reviewGroup.create({ data: { name: "Team B", sortOrder: 2 } });
    groups = await db.reviewGroup.findMany({ orderBy: { sortOrder: "asc" } });
  }
  return groups;
}

// Active group = newest activeFrom; if that is older than ROTATION_DAYS the
// rotation happens automatically right here (self-healing, no cron).
export async function activeGroup(): Promise<ReviewGroup> {
  const groups = await ensureGroups();
  let active = groups[0];
  for (const g of groups) {
    const t = g.activeFrom?.getTime() ?? 0;
    if (t > (active.activeFrom?.getTime() ?? 0)) active = g;
  }
  if (active.activeFrom && Date.now() - active.activeFrom.getTime() > ROTATION_DAYS * 86400000) {
    const idx = groups.findIndex((g) => g.id === active.id);
    const next = groups[(idx + 1) % groups.length];
    return db.reviewGroup.update({ where: { id: next.id }, data: { activeFrom: new Date() } });
  }
  return active;
}

// Manual "Roteer team" — hands the baton to the next group right now.
export async function rotateTeam(): Promise<ReviewGroup> {
  const groups = await ensureGroups();
  const active = await activeGroup();
  // NB: match by id — `active` is a different object instance than the one
  // inside `groups`, so indexOf(active) would always be -1.
  const idx = groups.findIndex((g) => g.id === active.id);
  const next = groups[(idx + 1) % groups.length];
  return db.reviewGroup.update({ where: { id: next.id }, data: { activeFrom: new Date() } });
}

// Self-healing housekeeping, run on every read of /api/reviews/groups:
// flip the weekly rotation flag (still shown on the team page) and clean the
// ledger. Assignment rows are now written by the PATCH route when someone
// reports a review (see the report block there) — leftover todo rows from the
// old per-member distribution model are dropped.
export async function ensureAssignments(): Promise<void> {
  await activeGroup();
  await db.reviewAssignment.deleteMany({ where: { status: "todo" } });
}

export interface TaskItem {
  review: GoogleReview;
  assignmentId: string;
  status: string;
}

// The shared deck — the same list for every member. Due follow-ups first
// (oldest first — longest overdue on top), then the newest unreported bad
// reviews (the latest 3★-and-below reviews first). Any employee can report
// any of them from any phone, so nobody's screen ever says "done" while bad
// reviews are still out there unreported.
export async function sharedDeck(): Promise<TaskItem[]> {
  const week = currentWeekKey();
  const rows = await db.reviewAssignment.findMany({
    where: { weekKey: week },
    select: { id: true, reviewId: true },
  });
  const assignmentByReview = new Map(rows.map((a) => [a.reviewId, a.id]));

  const candidates = await db.googleReview.findMany({
    where: { status: "active" },
    orderBy: { createTime: "desc" },
    take: 500,
  });
  const work = candidates.filter(isMemberWork);

  const rank = (r: GoogleReview): number => (r.reported && r.followUpAt ? 0 : 1);
  const createdAt = (r: GoogleReview) => (r.createTime ? r.createTime.getTime() : 0);
  work.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return ra === 0 ? createdAt(a) - createdAt(b) : createdAt(b) - createdAt(a);
  });

  return work.slice(0, DECK_LIMIT).map((review) => ({
    review,
    // Real assignment id when the row exists (done ledger); a synthetic one
    // for reviews nobody holds yet — the card key and nothing more.
    assignmentId: assignmentByReview.get(review.id) ?? `shared-${review.id}`,
    status: "todo",
  }));
}

// A member's own reports this week — the "Gerapporteerd" tab.
export async function myReports(userId: string): Promise<TaskItem[]> {
  const week = currentWeekKey();
  const rows = await db.reviewAssignment.findMany({
    where: { userId, weekKey: week, status: "done" },
    include: { review: true },
    orderBy: { completedAt: "desc" },
  });
  return rows.map((a) => ({ review: a.review, assignmentId: a.id, status: "done" }));
}

// The positive-reviews section — the same shared list for every member:
// unanswered 4-5★ reviews, newest first, one row per review. When the same
// review exists as both an Outscraper row and a GBP row (the GBP flood created
// duplicates), the GBP row wins — only rows with an accounts/… location can be
// posted to Google.
export async function positiveDeck(): Promise<TaskItem[]> {
  const candidates = await db.googleReview.findMany({
    where: { status: "active", starRating: { gte: 4 }, replyText: null },
    orderBy: { createTime: "desc" },
    take: 80,
  });
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const isPushable = (r: GoogleReview) =>
    !!r.locationName && r.locationName.startsWith("accounts/");
  const seen = new Map<string, GoogleReview>();
  for (const r of candidates) {
    const key = `${norm(r.reviewerName)}|${
      r.createTime ? new Date(r.createTime).toISOString().slice(0, 10) : ""
    }`;
    const existing = seen.get(key);
    if (!existing || (isPushable(r) && !isPushable(existing))) seen.set(key, r);
  }
  return [...seen.values()]
    .sort((a, b) => (b.createTime?.getTime() ?? 0) - (a.createTime?.getTime() ?? 0))
    .slice(0, 15)
    .map((review) => ({ review, assignmentId: `pos-${review.id}`, status: "todo" }));
}

export interface MemberProgress {
  id: string;
  name: string;
  total: number;
  done: number;
}

// Lead view: who reported what this week. Total is the shared deck size —
// the same for every member — so each bar shows that member's share of the
// reporting that got done.
export async function teamOverview(groupId: string): Promise<MemberProgress[]> {
  const week = currentWeekKey();
  const members = await db.user.findMany({
    where: { groupId, status: "active", role: { notIn: ["owner", "admin"] } },
    orderBy: { name: "asc" },
  });
  const rows = await db.reviewAssignment.findMany({
    where: { weekKey: week, status: "done" },
    select: { userId: true, groupId: true },
  });
  const deckSize = (await sharedDeck()).length;
  return members.map((m) => ({
    id: m.id,
    name: m.name,
    total: deckSize,
    done: rows.filter((r) => r.userId === m.id).length,
  }));
}
