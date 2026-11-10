import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";

// GET    /api/ads/agent/memory          → list all memory rows
// POST   /api/ads/agent/memory { kind, text }   → add rule/fact
// DELETE /api/ads/agent/memory { id }   → remove

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db.adsAgentMemory.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ memory: rows });
}

export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { kind?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }
  const kind = ["rule", "fact", "profile"].includes(String(body.kind)) ? String(body.kind) : "fact";
  const text = String(body.text ?? "").trim();
  const maxLen = kind === "profile" ? 5000 : 500;
  if (!text || text.length > maxLen) {
    return NextResponse.json({ error: `Tekst verplicht (max ${maxLen} tekens)` }, { status: 400 });
  }
  const row = await db.adsAgentMemory.create({ data: { kind, text, source: "user" } });
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });
  }
  await db.adsAgentMemory.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
