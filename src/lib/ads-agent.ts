// ─── Ads Agent — Bavian-style approval autopilot ───
// The agent ANALYSES on a schedule or on demand and writes proposals into
// AdsAgentProposal. Nothing executes until a human approves a proposal in the
// UI; execution reuses the exact same write functions as the manual actions
// route, and every execution lands in AuditLog via the proposals API.
//
// Memory (AdsAgentMemory) holds standing rules/facts in plain language. Rules
// are injected into the AI prompts so the agent respects them ("never touch
// brand campaigns", "keep X under €20/day").

import { db } from "@/lib/db";
import {
  fetchSearchTerms,
  analyzeSearchTerms,
  fetchBudgetAdvice,
  fetchKeywordFlags,
  addNegativeKeywords,
  pauseKeyword,
  setCampaignBudget,
  dateClause,
  WASTE_RULES,
} from "@/lib/ads-autopilot";
import { removeNegative } from "@/lib/ads-inventory";
import { updateRsaTexts, setAdStatus } from "@/lib/ads-creative";
import { queryGoogleAds } from "@/lib/google-ads";
import { callDeepSeekJSON } from "@/lib/deepseek";

export type ProposalType =
  | "add_negatives"
  | "pause_keyword"
  | "set_budget"
  | "remove_negative";

export interface NewProposal {
  fingerprint: string;
  type: ProposalType;
  title: string;
  reason: string;
  payload: Record<string, unknown>;
}

// ─── Memory ───

export async function getMemory(): Promise<{ rules: string[]; facts: string[]; profile: string | null }> {
  const rows = await db.adsAgentMemory.findMany({ orderBy: { createdAt: "asc" } });
  return {
    rules: rows.filter((r) => r.kind === "rule").map((r) => r.text),
    facts: rows.filter((r) => r.kind === "fact" || r.kind === "preference").map((r) => r.text),
    profile: rows.find((r) => r.kind === "profile")?.text ?? null,
  };
}

function memoryText(mem: { rules: string[]; facts: string[]; profile?: string | null }): string {
  const parts: string[] = [];
  if (mem.profile) parts.push(`Bedrijfsprofiel:\n${mem.profile}`);
  if (mem.rules.length) parts.push("Regels die je ALTIJD moet volgen:\n- " + mem.rules.join("\n- "));
  if (mem.facts.length) parts.push("Feiten over het bedrijf:\n- " + mem.facts.join("\n- "));
  return parts.join("\n\n");
}

// ─── Account brain — the full picture the agent reasons over ───
// Two aggregated GAQL passes (30d + 7d per campaign, no date segments) give the
// agent real numbers AND a trend: is a campaign accelerating or dying?

interface BrainCampaign {
  id: string;
  name: string;
  status: string;
  channel: string;
  cost30: number; clicks30: number; conv30: number; value30: number; impr30: number;
  cost7: number; clicks7: number; conv7: number;
}

interface AccountBrain {
  campaigns: BrainCampaign[];
  totals30: { cost: number; clicks: number; conv: number; value: number; impr: number };
  totals7: { cost: number; clicks: number; conv: number };
}

async function fetchAccountBrain(accessToken: string, customerId: string): Promise<AccountBrain> {
  const run = async (range: string) => {
    const res = await queryGoogleAds(customerId, `
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE campaign.status != 'REMOVED' AND segments.date DURING ${range}
      LIMIT 300
    `, accessToken);
    return (res.results ?? []) as Record<string, Record<string, unknown>>[];
  };

  const [rows30, rows7] = await Promise.all([run("LAST_30_DAYS"), run("LAST_7_DAYS")]);
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const eur = (m: Record<string, unknown>) => num(m.costMicros ?? m.cost_micros) / 1e6;

  const by7 = new Map<string, { cost: number; clicks: number; conv: number }>();
  for (const r of rows7) {
    const c = r.campaign ?? {};
    const m = r.metrics ?? {};
    by7.set(String(c.id), { cost: eur(m), clicks: num(m.clicks), conv: num(m.conversions) });
  }

  const campaigns: BrainCampaign[] = [];
  const totals30 = { cost: 0, clicks: 0, conv: 0, value: 0, impr: 0 };
  const totals7 = { cost: 0, clicks: 0, conv: 0 };

  for (const r of rows30) {
    const c = r.campaign ?? {};
    const m = r.metrics ?? {};
    const id = String(c.id);
    const b7 = by7.get(id) ?? { cost: 0, clicks: 0, conv: 0 };
    const row: BrainCampaign = {
      id,
      name: String(c.name ?? ""),
      status: String(c.status ?? ""),
      channel: String(c.advertisingChannelType ?? c.advertising_channel_type ?? ""),
      cost30: eur(m), clicks30: num(m.clicks), conv30: num(m.conversions),
      value30: num(m.conversionsValue ?? m.conversions_value), impr30: num(m.impressions),
      cost7: b7.cost, clicks7: b7.clicks, conv7: b7.conv,
    };
    campaigns.push(row);
    totals30.cost += row.cost30; totals30.clicks += row.clicks30; totals30.conv += row.conv30;
    totals30.value += row.value30; totals30.impr += row.impr30;
    totals7.cost += b7.cost; totals7.clicks += b7.clicks; totals7.conv += b7.conv;
  }

  campaigns.sort((a, b) => b.cost30 - a.cost30);
  return { campaigns, totals30, totals7 };
}

function brainText(brain: AccountBrain): string {
  const { totals30: t, totals7: w } = brain;
  const daily30 = t.cost / 30;
  const daily7 = w.cost / 7;
  const trendPct = daily30 > 0 ? Math.round(((daily7 - daily30) / daily30) * 100) : 0;
  const trend = trendPct > 10 ? `stijgt (+${trendPct}%)` : trendPct < -10 ? `daalt (${trendPct}%)` : "stabiel";

  const lines = brain.campaigns.slice(0, 20).map((c) => {
    const cpa = c.conv30 > 0 ? `CPA €${(c.cost30 / c.conv30).toFixed(0)}` : "geen conv";
    const roas = c.cost30 > 0 && c.value30 > 0 ? `ROAS ${(c.value30 / c.cost30).toFixed(1)}` : null;
    const ctr = c.impr30 > 0 ? `CTR ${((c.clicks30 / c.impr30) * 100).toFixed(1)}%` : null;
    return `- ${c.name} [${c.channel}${c.status !== "ENABLED" ? `, ${c.status}` : ""}] 30d: €${c.cost30.toFixed(0)}, ${c.clicks30} kliks, ${c.conv30.toFixed(1)} conv, ${cpa}${roas ? `, ${roas}` : ""}${ctr ? `, ${ctr}` : ""} | 7d: €${c.cost7.toFixed(0)}, ${c.conv7.toFixed(1)} conv`;
  });

  return [
    `ACCOUNT laatste 30 dagen: €${t.cost.toFixed(0)} spend, ${t.clicks} kliks, ${t.impr.toLocaleString("nl-BE")} vertoningen, ${t.conv.toFixed(1)} conversies, €${t.value.toFixed(0)} waarde${t.conv > 0 ? `, CPA €${(t.cost / t.conv).toFixed(0)}` : ""}.`,
    `Trend: dagelijkse spend ${trend} (7d: €${daily7.toFixed(0)}/dag vs 30d-gemiddelde €${daily30.toFixed(0)}/dag), conversies 7d: ${w.conv.toFixed(1)}.`,
    `CAMPAGNES op kosten (30d | 7d):\n${lines.join("\n")}`,
  ].join("\n");
}

// ─── Self-learning memory ───
// After each chat turn the agent extracts durable facts/rules/preferences from
// what the user said ("Gent is prioriteit", "raak merkcampagne nooit aan") and
// stores them — so you never have to repeat yourself.

async function learnFromChatTurn(question: string, answer: string): Promise<string[]> {
  const mem = await getMemory();
  const existing = new Set(
    [...mem.rules, ...mem.facts, ...(mem.profile ? [mem.profile] : [])]
      .map((t) => t.trim().toLowerCase())
  );
  try {
    const out = await callDeepSeekJSON<{ memory: { kind: string; text: string }[] }>({
      systemPrompt: `Je beheert het langetermijngeheugen van een Google Ads-agent voor een reparatieshop. Haal uit de gebruikersvraag ALLEEN duurzame, herbruikbare informatie: voorkeuren, prioriteiten, regels, bedrijfsfeiten (bv. "Gent is prioriteit", "nooit aan merkcampagne komen", "wij repareren geen tablets"). GEEN eenmalige vragen, cijfers of smalltalk. Antwoord als JSON {"memory":[{"kind":"rule|fact|preference","text":"korte NL zin"}]} — lege array als er niets te leren valt. Max 2 items.`,
      userPrompt: `Gebruiker zei: "${question}"\nAgent antwoordde (context): "${answer.slice(0, 600)}"`,
      temperature: 0.2,
      maxTokens: 300,
    });
    const learned: string[] = [];
    for (const m of (out.memory ?? []).slice(0, 2)) {
      const text = String(m.text ?? "").trim();
      const kind = ["rule", "fact", "preference"].includes(m.kind) ? m.kind : "fact";
      if (!text || text.length > 500 || existing.has(text.toLowerCase())) continue;
      await db.adsAgentMemory.create({ data: { kind, text, source: "agent" } });
      existing.add(text.toLowerCase());
      learned.push(text);
    }
    return learned;
  } catch {
    return []; // learning is best-effort, never blocks the chat
  }
}

// ─── Proposal generation ───
// Rule-based candidates first (deterministic, no AI cost), then one AI pass
// that filters them through the memory rules and can add judgment calls.

export async function generateProposals(
  accessToken: string,
  customerId: string
): Promise<{ created: number; skipped: number }> {
  const mem = await getMemory();
  const clause = dateClause("LAST_30_DAYS");

  const [rawTerms, budgets, keywords] = await Promise.all([
    fetchSearchTerms(accessToken, customerId, clause),
    fetchBudgetAdvice(accessToken, customerId, "LAST_30_DAYS"),
    fetchKeywordFlags(accessToken, customerId, "LAST_30_DAYS"),
  ]);
  const terms = analyzeSearchTerms(rawTerms);

  const candidates: NewProposal[] = [];

  // 1. Waste search terms → negative keywords (grouped per campaign)
  const waste = terms.filter((t) => t.verdict === "waste");
  const byCampaign = new Map<string, typeof waste>();
  for (const t of waste) {
    byCampaign.set(t.campaignId, [...(byCampaign.get(t.campaignId) ?? []), t]);
  }
  for (const [campaignId, list] of byCampaign) {
    for (const t of list) {
      candidates.push({
        fingerprint: `add_negatives:${campaignId}:${t.term.toLowerCase()}`,
        type: "add_negatives",
        title: `Blokkeer zoekterm "${t.term}"`,
        reason: `€${(t.costMicros / 1e6).toFixed(2)} gespendeerd, ${t.clicks} kliks, 0 conversies in 30 dagen (campagne: ${t.campaignName}).`,
        payload: { customerId, campaignId, terms: [t.term] },
      });
    }
  }

  // 2. Losing keywords → pause
  for (const k of keywords.filter((k) => k.flag === "pause_candidate")) {
    candidates.push({
      fingerprint: `pause_keyword:${k.resourceName}`,
      type: "pause_keyword",
      title: `Pauzeer keyword "${k.text}"`,
      reason: `${k.reason} (campagne: ${k.campaignName}, kosten: €${(k.costMicros / 1e6).toFixed(2)}).`,
      payload: { customerId, criterionResourceName: k.resourceName, label: k.text },
    });
  }

  // 3. Budget advice → adjust (only the clear cases)
  for (const b of budgets.filter((b) => b.action !== "hold" && b.budgetResourceName)) {
    candidates.push({
      fingerprint: `set_budget:${b.campaignId}:${b.suggestedDailyBudgetMicros}`,
      type: "set_budget",
      title: `${b.action === "increase" ? "Verhoog" : "Verlaag"} budget ${b.campaignName}`,
      reason: `${b.reason} Huidig: €${(b.dailyBudgetMicros / 1e6).toFixed(2)}/dag → voorgesteld: €${(b.suggestedDailyBudgetMicros / 1e6).toFixed(2)}/dag.`,
      payload: {
        customerId,
        budgetResourceName: b.budgetResourceName,
        amountMicros: b.suggestedDailyBudgetMicros,
        label: b.campaignName,
      },
    });
  }

  // AI filter pass — memory rules can veto candidates. No rules → skip the
  // call entirely (saves latency and tokens).
  let filtered = candidates;
  const memBlock = memoryText(mem);
  if (memBlock && candidates.length) {
    try {
      const verdicts = await callDeepSeekJSON<{ veto: number[]; notes: string[] }>({
        systemPrompt: `Je bent de Google Ads-agent van een Belgische reparatieshop. Je krijgt voorgestelde acties en staande regels/feiten. Veto ELKE actie die een regel breekt of duidelijk tegen het bedrijfsbelang is. Antwoord ALLEEN met JSON: {"veto":[index,...],"notes":["korte NL reden per veto"]}. Indices zijn 0-based.`,
        userPrompt: `${memBlock}\n\nVoorgestelde acties:\n${candidates.map((c, i) => `${i}. ${c.title} — ${c.reason}`).join("\n")}`,
        temperature: 0.2,
        maxTokens: 1000,
      });
      const vetoed = new Set(verdicts.veto ?? []);
      filtered = candidates.filter((_, i) => !vetoed.has(i));
    } catch (err) {
      console.error("Agent AI-filter mislukt, regels niet toegepast:", err);
    }
  }

  // Dedupe: never create a proposal while an identical pending one exists,
  // and don't re-propose something rejected in the last 7 days.
  let created = 0;
  let skipped = 0;
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  for (const c of filtered) {
    const existing = await db.adsAgentProposal.findFirst({
      where: {
        fingerprint: c.fingerprint,
        OR: [
          { status: "pending" },
          { status: "rejected", decidedAt: { gte: weekAgo } },
          { status: "executed", executedAt: { gte: weekAgo } },
        ],
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.adsAgentProposal.create({ data: { ...c, payload: c.payload as object } });
    created++;
  }
  return { created, skipped };
}

// ─── Execution — mirrors the actions route exactly ───

export async function executeProposal(id: string, actor: string): Promise<string> {
  const p = await db.adsAgentProposal.findUnique({ where: { id } });
  if (!p) throw new Error("Voorstel niet gevonden");
  if (p.status !== "approved") throw new Error("Voorstel is niet goedgekeurd");

  const body = p.payload as Record<string, unknown>;
  const customerId = String(body.customerId ?? "");
  let summary: string;

  if (p.type === "add_negatives") {
    const terms = Array.isArray(body.terms) ? body.terms.map(String).filter(Boolean) : [];
    if (!terms.length || terms.length > 50) throw new Error("Ongeldige terms");
    await addNegativeKeywords(customerId, String(body.campaignId), terms);
    summary = `${terms.length} negatief keyword toegevoegd: ${terms.join(", ")}`;
  } else if (p.type === "pause_keyword") {
    await pauseKeyword(customerId, String(body.criterionResourceName));
    summary = `Keyword gepauzeerd: ${String(body.label ?? "")}`;
  } else if (p.type === "set_budget") {
    const amountMicros = Number(body.amountMicros);
    if (!Number.isFinite(amountMicros) || amountMicros <= 0 || amountMicros > 500_000_000) {
      throw new Error("Budget buiten limiet");
    }
    await setCampaignBudget(customerId, String(body.budgetResourceName), amountMicros);
    summary = `Budget ${String(body.label ?? "")} → €${(amountMicros / 1e6).toFixed(2)}/dag`;
  } else if (p.type === "remove_negative") {
    await removeNegative(customerId, String(body.resourceName));
    summary = `Negatief keyword verwijderd: ${String(body.label ?? "")}`;
  } else {
    throw new Error(`Onbekend type: ${p.type}`);
  }

  await db.adsAgentProposal.update({
    where: { id },
    data: { status: "executed", executedAt: new Date(), resultMsg: summary },
  });
  void actor; // actor is logged by the API route in AuditLog
  return summary;
}

// ─── Chat with the agent — multi-turn + actionable proposals ───

export interface ChatTurn { role: "user" | "assistant"; content: string }

export interface ChatProposalView {
  id: string;
  type: string;
  title: string;
  reason: string;
}

export interface ChatResult {
  answer: string;
  /** Pending proposals created from this turn (already in the review list). */
  proposals: ChatProposalView[];
  /** New durable memory the agent stored from this turn. */
  learned: string[];
}

interface ChatData {
  contextText: string;
  waste: { term: string; campaignId: string; campaignName: string; costMicros: number; clicks: number }[];
  pauseCandidates: { resourceName: string; text: string; campaignName: string; costMicros: number; reason: string }[];
  budgets: { campaignId: string; campaignName: string; budgetResourceName: string | null; dailyBudgetMicros: number; suggestedDailyBudgetMicros: number; action: string; reason: string }[];
}

async function buildChatData(accessToken: string, customerId: string): Promise<ChatData> {
  const mem = await getMemory();
  const clause = dateClause("LAST_30_DAYS");
  const [rawTerms, budgets, keywords, brain] = await Promise.all([
    fetchSearchTerms(accessToken, customerId, clause),
    fetchBudgetAdvice(accessToken, customerId, "LAST_30_DAYS"),
    fetchKeywordFlags(accessToken, customerId, "LAST_30_DAYS"),
    fetchAccountBrain(accessToken, customerId),
  ]);
  const terms = analyzeSearchTerms(rawTerms);
  const waste = terms.filter((t) => t.verdict === "waste" || t.verdict === "review");
  const pauseCandidates = keywords.filter((k) => k.flag === "pause_candidate");

  // The agent's working memory for this turn: full account picture first,
  // then the actionable lists with the exact resource names proposals may use.
  const contextText = [
    brainText(brain),
    memoryText(mem),
    `Verspillende/beoordelen zoektermen (${waste.length}):\n${waste.slice(0, 25).map((t) => `- "${t.term}" — campagneId ${t.campaignId} (${t.campaignName}), €${(t.costMicros / 1e6).toFixed(0)}, ${t.clicks} kliks, 0 conv`).join("\n")}`,
    `Pauze-kandidaten keywords (${pauseCandidates.length}):\n${pauseCandidates.slice(0, 25).map((k) => `- "${k.text}" [${k.resourceName}] — ${k.campaignName}, €${(k.costMicros / 1e6).toFixed(0)}, ${k.reason}`).join("\n")}`,
    `Budgetadviezen:\n${budgets.map((b) => `- ${b.campaignName}: ${b.action}, huidig €${(b.dailyBudgetMicros / 1e6).toFixed(0)}/dag → voorgesteld €${(b.suggestedDailyBudgetMicros / 1e6).toFixed(0)}/dag (${b.suggestedDailyBudgetMicros} micros)${b.budgetResourceName ? ` [${b.budgetResourceName}]` : " [geen budget-resource]"}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");

  return {
    contextText,
    waste: waste.map((t) => ({ term: t.term, campaignId: t.campaignId, campaignName: t.campaignName, costMicros: t.costMicros, clicks: t.clicks })),
    pauseCandidates: pauseCandidates.map((k) => ({ resourceName: k.resourceName, text: k.text, campaignName: k.campaignName, costMicros: k.costMicros, reason: k.reason })),
    budgets: budgets.map((b) => ({ campaignId: b.campaignId, campaignName: b.campaignName, budgetResourceName: b.budgetResourceName ?? null, dailyBudgetMicros: b.dailyBudgetMicros, suggestedDailyBudgetMicros: b.suggestedDailyBudgetMicros, action: b.action, reason: b.reason })),
  };
}

/** The model proposes; we validate against the fresh data. Anything referencing
 *  a resource name or amount that is not in the data is dropped — never trust
 *  the model with live writes. */
function validateChatProposals(
  raw: unknown,
  data: ChatData,
  customerId: string
): NewProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: NewProposal[] = [];

  for (const item of raw.slice(0, 5)) {
    const p = item as Record<string, unknown>;
    const type = String(p.type ?? "");
    const title = String(p.title ?? "").slice(0, 120);
    const reason = String(p.reason ?? "").slice(0, 500);
    if (!title) continue;

    if (type === "add_negatives") {
      const campaignId = String(p.campaignId ?? "");
      const known = data.waste.filter((t) => t.campaignId === campaignId);
      if (!known.length) continue;
      const allowed = new Set(known.map((t) => t.term.toLowerCase()));
      const terms = (Array.isArray(p.terms) ? p.terms : [])
        .map(String).filter((t) => allowed.has(t.toLowerCase())).slice(0, 20);
      if (!terms.length) continue;
      out.push({
        fingerprint: `chat:add_negatives:${campaignId}:${terms.map((t) => t.toLowerCase()).sort().join("|")}`,
        type, title,
        reason: reason || "Voorgesteld vanuit de chat.",
        payload: { customerId, campaignId, terms },
      });
    } else if (type === "pause_keyword") {
      const rn = String(p.criterionResourceName ?? "");
      const kw = data.pauseCandidates.find((k) => k.resourceName === rn);
      if (!kw) continue;
      out.push({
        fingerprint: `pause_keyword:${rn}`,
        type, title,
        reason: reason || `${kw.reason} (campagne: ${kw.campaignName}).`,
        payload: { customerId, criterionResourceName: rn, label: kw.text },
      });
    } else if (type === "set_budget") {
      const brn = String(p.budgetResourceName ?? "");
      const b = data.budgets.find((x) => x.budgetResourceName === brn);
      if (!b || !b.budgetResourceName) continue;
      // Amount is FORCED to the computed suggestion — the model may propose
      // the action, never the number.
      out.push({
        fingerprint: `set_budget:${b.campaignId}:${b.suggestedDailyBudgetMicros}`,
        type, title,
        reason: reason || b.reason,
        payload: { customerId, budgetResourceName: b.budgetResourceName, amountMicros: b.suggestedDailyBudgetMicros, label: b.campaignName },
      });
    }
    // remove_negative and anything else: not chat-proposable (needs live list)
  }
  return out;
}

/** Single-shot variant kept for callers that don't need history (e.g. Telegram). */
export async function askAgent(
  accessToken: string,
  customerId: string,
  question: string
): Promise<string> {
  const r = await chatWithAgent(accessToken, customerId, [], question);
  return r.answer;
}

/** Multi-turn chat with tool use: the model answers AND may draft proposals.
 *  Valid proposals are persisted as pending — nothing executes without the
 *  human approval click, same as the scheduled agent. */
export async function chatWithAgent(
  accessToken: string,
  customerId: string,
  history: ChatTurn[],
  question: string
): Promise<ChatResult> {
  const data = await buildChatData(accessToken, customerId);

  const historyBlock = history.length
    ? `\n\nEerdere conversatie:\n${history
        .map((t) => `${t.role === "user" ? "Gebruiker" : "Agent"}: ${t.content}`)
        .join("\n")}`
    : "";

  const raw = await callDeepSeekJSON<{ answer: string; proposals?: unknown[] }>({
    systemPrompt: `Je bent de senior Google Ads-consultant van QuickSolutions, een Belgische computer- en smartphone-reparatiezaak. Je kent dit account vanbuiten: de ACCOUNT- en CAMPAAGNES-secties hieronder zijn je eigen analyse, altijd actueel. Praat als een collega die de cijfers kent — nooit "ik zou moeten nakijken", je hebt de data al.

Stijl: Vlaams Nederlands, direct en concreet. Gebruik echte cijfers uit de data. Verzin niets; staat iets er niet, zeg dan eerlijk welke data ontbreekt. Denk mee als een marketeer: benoem trends, kruisverbanden tussen campagnes, en wat de beste volgende stap is. Verwijs gerust naar eerdere beurten in het gesprek. Volg de REGELS uit het geheugen altijd.

Je kunt ook ACTIES voorstellen. Als de gebruiker vraagt iets te doen (zoekterm blokkeren, keyword pauzeren, budget aanpassen), voeg dan "proposals" toe aan je JSON. Regels:
- Gebruik ALLEEN resource-namen, campagneIds en bedragen die letterlijk in de data hieronder staan — verzin er nooit zelf.
- add_negatives: {"type":"add_negatives","title":"...","reason":"...","campaignId":"...","terms":["..."]} — alleen zoektermen uit de verspilling-lijst.
- pause_keyword: {"type":"pause_keyword","title":"...","reason":"...","criterionResourceName":"..."} — alleen uit pauze-kandidaten.
- set_budget: {"type":"set_budget","title":"...","reason":"...","budgetResourceName":"..."} — het bedrag wordt automatisch het voorgestelde bedrag uit de data.
- Max 5 proposals. Noem in je answer wat je hebt voorgesteld. De eigenaar keurt elk voorstel nog goed — voer niets "zelf" uit en beweer nooit dat iets al is uitgevoerd.

Antwoord als JSON {"answer":"...","proposals":[...]} — answer mag Markdown gebruiken, proposals mag leeg of weggelaten zijn.`,
    userPrompt: `${data.contextText}${historyBlock}\n\nGebruiker: ${question}`,
    temperature: 0.3,
    maxTokens: 1600,
  });

  // Validate → dedupe → persist
  const candidates = validateChatProposals(raw.proposals, data, customerId);
  const created: ChatProposalView[] = [];
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  for (const c of candidates) {
    const existing = await db.adsAgentProposal.findFirst({
      where: {
        fingerprint: c.fingerprint,
        OR: [
          { status: "pending" },
          { status: "rejected", decidedAt: { gte: weekAgo } },
          { status: "executed", executedAt: { gte: weekAgo } },
        ],
      },
    });
    if (existing) continue;
    const row = await db.adsAgentProposal.create({ data: { ...c, payload: c.payload as object } });
    created.push({ id: row.id, type: row.type, title: row.title, reason: row.reason });
  }

  // Learn durable facts/rules from this turn (so nothing needs repeating)
  const learned = await learnFromChatTurn(question, raw.answer);

  return { answer: raw.answer, proposals: created, learned };
}

export { WASTE_RULES };
export { updateRsaTexts, setAdStatus };
