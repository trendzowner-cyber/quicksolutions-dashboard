import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchSearchTerms, analyzeSearchTerms, fetchBudgetAdvice, dateClause } from "@/lib/ads-autopilot";
import { getMemory } from "@/lib/ads-agent";
import { callDeepSeekJSON } from "@/lib/deepseek";

export const maxDuration = 60;

// GET /api/ads/agent/questions?accountId= — "Needs you": the agent asks what it
// can't decide alone. Answering stores a durable fact/rule in memory.
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ questions: [], note: "Google Ads niet verbonden" });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const accessToken = await getAdAccessToken();
    const mem = await getMemory();

    const [rawTerms, budgets] = await Promise.all([
      fetchSearchTerms(accessToken, accountId, dateClause("LAST_30_DAYS")),
      fetchBudgetAdvice(accessToken, accountId, "LAST_30_DAYS"),
    ]);
    const terms = analyzeSearchTerms(rawTerms);
    const waste = terms.filter((t) => t.verdict === "waste" || t.verdict === "review");

    // Already-answered questions: stored as "Vraag: ... Antwoord: ..." facts
    const answered = new Set(
      mem.facts
        .filter((f) => f.startsWith("Vraag: "))
        .map((f) => f.split("\n")[0].toLowerCase().trim())
    );

    const out = await callDeepSeekJSON<{ questions: { question: string; why: string }[] }>({
      systemPrompt: `Je bent de Google Ads-agent van een Belgische reparatieshop. Stel max 3 korte, concrete verduidelijkingsvragen die je NIET uit de data kunt beantwoorden maar die je beslissingen scherper maken. Bijvoorbeeld over of een zoekterm relevant is ("Bieden jullie PS5-reparatie?"), seizoenspatronen, of prioriteiten. Geen vragen die de data al beantwoordt. Antwoord als JSON {"questions":[{"question":"...","why":"waarom dit helpt"}]}. Lege array als er niets onduidelijks is.`,
      userPrompt: `Account-data (30d):\n- Verspillende zoektermen: ${waste.slice(0, 15).map((t) => `"${t.term}" (€${(t.costMicros / 1e6).toFixed(0)}, ${t.clicks} kliks, 0 conv)`).join(", ")}\n- Budgetadviezen: ${budgets.slice(0, 10).map((b) => `${b.campaignName}: ${b.action}`).join(", ")}\n\nGeheugen:\n${mem.rules.map((r) => `- ${r}`).join("\n")}\n${mem.facts.map((f) => `- ${f}`).join("\n")}`,
      temperature: 0.3,
      maxTokens: 600,
    });

    const questions = (out.questions ?? [])
      .filter((q) => q.question && !answered.has(q.question.toLowerCase().trim()))
      .slice(0, 3);
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("Agent questions mislukt:", err);
    return NextResponse.json({ questions: [] });
  }
}

// POST /api/ads/agent/questions — store an answer as a memory fact
// body: { question: string, answer: string }
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const question = String(body?.question ?? "").trim().slice(0, 300);
    const answer = String(body?.answer ?? "").trim().slice(0, 500);
    if (!question || !answer) {
      return NextResponse.json({ error: "Vraag en antwoord verplicht" }, { status: 400 });
    }
    await db.adsAgentMemory.create({
      data: {
        kind: "fact",
        text: `Vraag: ${question}\nAntwoord: ${answer}`,
        source: "user",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Antwoord opslaan mislukt", details: String(err) }, { status: 500 });
  }
}
