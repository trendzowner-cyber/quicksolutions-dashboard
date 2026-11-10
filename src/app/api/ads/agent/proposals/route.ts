import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { executeProposal } from "@/lib/ads-agent";

export const maxDuration = 60;

// GET /api/ads/agent/proposals?status=pending|all
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const where = status === "all" ? {} : { status };
  const [proposals, counts] = await Promise.all([
    db.adsAgentProposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: status === "all" ? 100 : 50,
    }),
    db.adsAgentProposal.groupBy({ by: ["status"], _count: true }),
  ]);
  return NextResponse.json({
    proposals,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  });
}

// POST { id, decision: "approve" | "reject" }
// Approve = execute immediately against the live account, then log. This is
// the same write path as the manual actions route, with the same ceilings.
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { id?: string; decision?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }
  const { id, decision } = body;
  if (!id || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json({ error: "id en decision (approve|reject) zijn verplicht" }, { status: 400 });
  }

  const proposal = await db.adsAgentProposal.findUnique({ where: { id } });
  if (!proposal) {
    return NextResponse.json({ error: "Voorstel niet gevonden" }, { status: 404 });
  }
  if (proposal.status !== "pending") {
    return NextResponse.json({ error: `Voorstel is al ${proposal.status}` }, { status: 409 });
  }

  if (decision === "reject") {
    await db.adsAgentProposal.update({
      where: { id },
      data: { status: "rejected", decidedBy: user.userId, decidedAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        actorId: user.userId,
        action: "ads_agent_reject",
        entity: "ads_agent_proposal",
        entityId: id,
        metadata: { title: proposal.title, type: proposal.type },
      },
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // approve → mark, then execute
  await db.adsAgentProposal.update({
    where: { id },
    data: { status: "approved", decidedBy: user.userId, decidedAt: new Date() },
  });
  try {
    const summary = await executeProposal(id, user.userId);
    await db.auditLog.create({
      data: {
        actorId: user.userId,
        action: "ads_agent_execute",
        entity: "ads_agent_proposal",
        entityId: id,
        metadata: { title: proposal.title, type: proposal.type, summary },
      },
    });
    return NextResponse.json({ ok: true, status: "executed", summary });
  } catch (err) {
    await db.adsAgentProposal.update({
      where: { id },
      data: { status: "failed", resultMsg: String(err) },
    });
    return NextResponse.json(
      { error: `Uitvoering mislukt: ${String(err)}`, status: "failed" },
      { status: 500 }
    );
  }
}
