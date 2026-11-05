import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isClientUserId } from "@/lib/client-mode";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { TASK_CATEGORIES, normalizePriority } from "@/lib/tasks";

// Recurring obligations behind the dashboard dialog. Same validation as the
// Telegram /recur command, because both write the same table.

export interface RecurringInput {
  title?: string;
  description?: string | null;
  category?: string;
  priority?: string;
  days?: unknown;
  deadlineMinutes?: unknown;
  lateUntilMinutes?: unknown;
  remindBeforeMinutes?: unknown;
  assigneeId?: string | null;
  active?: boolean;
}

export function validDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((d) => Math.trunc(Number(d)))
        .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
    ),
  ].sort((a, b) => a - b);
}

export function normalizeRecurring(body: RecurringInput) {
  const days = validDays(body.days);
  const deadline = Math.trunc(Number(body.deadlineMinutes));
  const remind = Math.trunc(Number(body.remindBeforeMinutes));
  // null/undefined/"" all clear the grace period — Number(null) is 0, which is
  // finite but never greater than the deadline, so it falls through to null.
  const lateUntilRaw = Math.trunc(Number(body.lateUntilMinutes));
  const lateUntil =
    Number.isFinite(lateUntilRaw) && lateUntilRaw >= 0 && lateUntilRaw <= 1439
      ? lateUntilRaw
      : null;

  // A cut-off at or before the deadline would quietly move the target later —
  // it has to be a genuine extra window or not exist at all.
  const deadlineMinutes =
    Number.isFinite(deadline) && deadline >= 0 && deadline <= 1439 ? deadline : 1020;

  return {
    title: body.title?.trim().slice(0, 200) ?? "",
    description: body.description?.trim() || null,
    category: (TASK_CATEGORIES as readonly string[]).includes(String(body.category))
      ? String(body.category)
      : "algemeen",
    priority: normalizePriority(body.priority),
    days,
    deadlineMinutes,
    lateUntilMinutes: lateUntil !== null && lateUntil > deadlineMinutes ? lateUntil : null,
    remindBeforeMinutes: Number.isFinite(remind) && remind >= 0 ? Math.min(600, remind) : 30,
    assigneeId: body.assigneeId || null,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db.recurringTask.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ recurringTasks: rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load recurring tasks", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Admins always could create these. The client gained it alongside his own
  // interface — he wants recurring work from the team and had no way to set it
  // up. Scoped to him rather than to every role: the review team are viewers
  // too, and a wider gate would hand weekly-obligation powers to five people
  // who never asked for them.
  if (!hasRole(user.role, "admin") && !isClientUserId(user.userId)) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as RecurringInput;
    const data = normalizeRecurring(body);

    if (!data.title) {
      return NextResponse.json({ error: "Titel is verplicht" }, { status: 400 });
    }
    if (!data.days.length) {
      return NextResponse.json({ error: "Kies minstens één dag" }, { status: 400 });
    }

    // Same rule as POST /api/tasks, including the client exemption — the review
    // team are viewers, and they are exactly who he sets weekly work for.
    if (data.assigneeId && !hasRole(user.role, "marketer") && !isClientUserId(user.userId)) {
      const target = await db.user.findUnique({
        where: { id: data.assigneeId },
        select: { role: true },
      });
      if (!target || target.role === "viewer") {
        return NextResponse.json(
          { error: "Je kan taken enkel toewijzen aan een teamlid" },
          { status: 403 }
        );
      }
    }

    const recurring = await db.recurringTask.create({
      data: { ...data, active: body.active !== false },
    });

    await logActivity("recurring_created", {
      title: recurring.title,
      detail: `${data.days.length} dag(en) per week`,
      meta: recurring.id,
      actorId: user.userId,
    });

    return NextResponse.json({ recurringTask: recurring }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create recurring task", details: String(error) },
      { status: 500 }
    );
  }
}
