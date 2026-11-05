import { NextResponse } from "next/server";
import { getSessionUser, getUserById } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  activeGroup,
  currentWeekKey,
  ensureAssignments,
  ensureGroups,
  isMemberWork,
  myReports,
  positiveDeck,
  rotateTeam,
  sharedDeck,
  teamOverview,
} from "@/lib/review-groups";
import { logAudit } from "@/lib/audit";

// GET → everything the role-based Reviews page needs. The view mode is
// decided here, server-side: owner/admin → "admin", group lead → "lead",
// everyone else → "member" (their own assigned pile only).
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await getUserById(session.userId);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Self-healing: rotate if the week is up + distribute the active pile.
  await ensureAssignments();

  const [groups, active] = await Promise.all([ensureGroups(), activeGroup()]);

  const isAdmin = me.role === "owner" || me.role === "admin";
  const myGroup = me.groupId ? groups.find((g) => g.id === me.groupId) ?? null : null;
  const isLead = !!myGroup && myGroup.leadUserId === me.id;

  const meJson = { id: me.id, name: me.name, role: me.role, groupId: me.groupId };

  if (isAdmin) {
    const week = currentWeekKey();
    const assignedIds = new Set(
      (await db.reviewAssignment.findMany({ where: { weekKey: week }, select: { reviewId: true } })).map(
        (a) => a.reviewId
      )
    );
    const candidates = await db.googleReview.findMany({
      where: { status: "active" },
      orderBy: { createTime: "desc" },
      take: 500,
    });
    const unassigned = candidates.filter((r) => isMemberWork(r) && !assignedIds.has(r.id)).length;

    // The owner runs the same positive-reply shift as the team: the admin view
    // gets the shared positive deck too (see positiveDeck). Without it the
    // "positieve reviews + AI-antwoorden" surface existed only for viewer
    // accounts, so the owner could read every 4-5★ review in the big list but
    // never reply from the deck.
    const [teams, positive] = await Promise.all([
      Promise.all(
        groups.map(async (g) => ({
          group: { id: g.id, name: g.name, active: g.id === active.id, leadUserId: g.leadUserId },
          members: await teamOverview(g.id),
        }))
      ),
      positiveDeck(),
    ]);

    return NextResponse.json(
      {
        mode: "admin",
        me: meJson,
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          sortOrder: g.sortOrder,
          active: g.id === active.id,
          activeFrom: g.activeFrom,
          leadUserId: g.leadUserId,
        })),
        activeGroup: { id: active.id, name: active.name },
        teams,
        positive,
        unassigned,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (isLead && myGroup) {
    const [members, deck, reports, positive] = await Promise.all([
      teamOverview(myGroup.id),
      sharedDeck(),
      myReports(me.id),
      positiveDeck(),
    ]);
    const activeBool = myGroup.id === active.id;
    // Leads do the same work as everyone else — the shared deck plus their
    // own reports, with the team overview as extra info below it.
    return NextResponse.json(
      {
        mode: "lead",
        me: meJson,
        group: { id: myGroup.id, name: myGroup.name, active: activeBool },
        activeGroup: { id: active.id, name: active.name },
        members,
        tasks: deck,
        myDone: reports,
        positive,
        progress: { done: reports.length, total: deck.length + reports.length },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Member — the shared deck plus their own reports, nothing more.
  const [deck, reports, positive] = await Promise.all([
    sharedDeck(),
    myReports(me.id),
    positiveDeck(),
  ]);
  return NextResponse.json(
    {
      mode: "member",
      me: meJson,
      group: myGroup ? { id: myGroup.id, name: myGroup.name } : null,
      activeGroup: { id: active.id, name: active.name },
      tasks: deck,
      myDone: reports,
      positive,
      progress: { done: reports.length, total: deck.length + reports.length },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST → team management. rotate: owner/admin/lead. assign/setLead: owner/admin.
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await getUserById(session.userId);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = me.role === "owner" || me.role === "admin";
  const body = await request.json().catch(() => ({}));

  if (body.action === "rotate") {
    // Leads may rotate their own schedule; admins may always.
    const myGroup = me.groupId ? await db.reviewGroup.findUnique({ where: { id: me.groupId } }) : null;
    if (!isAdmin && myGroup?.leadUserId !== me.id) {
      return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
    }
    const next = await rotateTeam();
    await logAudit("team_rotated", me.id, "review_group", next.id, { name: next.name });
    return NextResponse.json({ activeGroup: { id: next.id, name: next.name } });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  if (body.action === "assign") {
    const { userId, groupId } = body;
    if (!userId) return NextResponse.json({ error: "userId ontbreekt" }, { status: 400 });
    await db.user.update({
      where: { id: userId },
      data: { groupId: groupId || null },
    });
    await logAudit("team_member_assigned", me.id, "user", userId, { groupId });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "setLead") {
    const { groupId, userId } = body;
    if (!groupId) return NextResponse.json({ error: "groupId ontbreekt" }, { status: 400 });
    await db.reviewGroup.update({
      where: { id: groupId },
      data: { leadUserId: userId || null },
    });
    await logAudit("team_lead_set", me.id, "review_group", groupId, { userId });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Onbekende actie" }, { status: 400 });
}
