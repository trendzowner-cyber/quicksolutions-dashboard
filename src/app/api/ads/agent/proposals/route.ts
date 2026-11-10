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

// POST two shapes:
//  A) { id, decision: "approve" | "reject" } — decide on a pending proposal.
//     Approve = execute immediately against the live account, then log. This is
//     the same write path as the manual actions route, with the same ceilings.
//  B) { manual: true, type, title, reason, payload } — user-created proposal
//     (e.g. the create-campaign wizard). Validated and stored as pending;
//     nothing executes until the user explicitly approves it.
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    id?: string;
    decision?: string;
    manual?: boolean;
    type?: string;
    title?: string;
    reason?: string;
    payload?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  // ---- Manual proposal creation (wizard) ----
  if (body.manual) {
    if (body.type !== "create_campaign") {
      return NextResponse.json({ error: "Alleen create_campaign wordt als handmatig voorstel ondersteund" }, { status: 400 });
    }
    const payload = body.payload as { customerId?: string; spec?: unknown } | undefined;
    if (!payload?.customerId || !payload.spec) {
      return NextResponse.json({ error: "customerId en spec zijn verplicht" }, { status: 400 });
    }
    try {
      const { validateCampaignSpec } = await import("@/lib/ads-create-campaign");
      validateCampaignSpec(payload.spec);
    } catch (err) {
      return NextResponse.json({ error: `Ongeldige campagne-spec: ${String(err)}` }, { status: 400 });
    }
    const title = String(body.title ?? "Nieuwe campagne").slice(0, 200);
    const reason = String(body.reason ?? "Handmatig aangemaakt via de wizard").slice(0, 500);
    const fingerprint = `create_campaign:${title.trim().toLowerCase()}`;
    const dupe = await db.adsAgentProposal.findFirst({
      where: { status: "pending", fingerprint },
    });
    if (dupe) {
      return NextResponse.json({ error: "Er bestaat al een identiek openstaand voorstel", id: dupe.id }, { status: 409 });
    }
    const proposal = await db.adsAgentProposal.create({
      data: {
        type: "create_campaign",
        title,
        reason,
        payload: payload as object,
        fingerprint,
        status: "pending",
        decidedBy: null,
      },
    });
    await db.auditLog.create({
      data: {
        actorId: user.userId,
        action: "ads_agent_manual_proposal",
        entity: "ads_agent_proposal",
        entityId: proposal.id,
        metadata: { title, type: "create_campaign" },
      },
    });
    return NextResponse.json({ ok: true, id: proposal.id, status: "pending" });
  }

  // ---- Approve / reject ----
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
