import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { chatWithAgent, type ChatTurn } from "@/lib/ads-agent";

export const maxDuration = 60;

const MAX_HISTORY = 40;      // messages kept per account (rolling window)
const CONTEXT_TURNS = 12;    // turns folded into the AI prompt

// GET /api/ads/agent/chat?accountId= — chat history, oldest first
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
  const messages = await db.adsAgentChatMessage.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY,
  });
  return NextResponse.json({
    messages: messages.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}

// POST /api/ads/agent/chat { message, accountId? } — send a message, get the reply
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const message = String(body?.message ?? "").trim();
    if (!message || message.length > 2000) {
      return NextResponse.json({ error: "Bericht verplicht (max 2000 tekens)" }, { status: 400 });
    }
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = String(body?.accountId ?? "") || ADS_ACCOUNTS[0];

    // Persist the user message first — even if the AI call fails, the log
    // shows what was asked.
    const userMsg = await db.adsAgentChatMessage.create({
      data: { accountId, role: "user", content: message },
    });

    // Rolling window: drop oldest beyond MAX_HISTORY
    const count = await db.adsAgentChatMessage.count({ where: { accountId } });
    if (count > MAX_HISTORY) {
      const stale = await db.adsAgentChatMessage.findMany({
        where: { accountId },
        orderBy: { createdAt: "asc" },
        take: count - MAX_HISTORY,
        select: { id: true },
      });
      await db.adsAgentChatMessage.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }

    const historyRows = await db.adsAgentChatMessage.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_TURNS + 1,
    });
    const history: ChatTurn[] = historyRows
      .reverse()
      .slice(0, -1) // exclude the message just asked
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const accessToken = await getAdAccessToken();
    const answer = await chatWithAgent(accessToken, accountId, history, message);

    const assistantMsg = await db.adsAgentChatMessage.create({
      data: { accountId, role: "assistant", content: answer },
    });

    return NextResponse.json({
      ok: true,
      userMessage: { id: userMsg.id, role: "user", content: message, createdAt: userMsg.createdAt },
      assistantMessage: { id: assistantMsg.id, role: "assistant", content: answer, createdAt: assistantMsg.createdAt },
    });
  } catch (err) {
    console.error("Agent chat mislukt:", err);
    return NextResponse.json({ error: "Bericht mislukt", details: String(err) }, { status: 500 });
  }
}

// DELETE /api/ads/agent/chat { accountId? } — clear the conversation
export async function DELETE(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const accountId = String(body?.accountId ?? "") || ADS_ACCOUNTS[0];
  const { count } = await db.adsAgentChatMessage.deleteMany({ where: { accountId } });
  return NextResponse.json({ ok: true, deleted: count });
}
