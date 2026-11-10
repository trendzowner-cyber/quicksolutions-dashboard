import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionUser } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchCampaignAssets, addSitelink, addCallout, removeCampaignAsset } from "@/lib/ads-assets";
import { createConversionAction } from "@/lib/ads-conversions";
import { db } from "@/lib/db";

export const maxDuration = 60;

// GET /api/ads/assets?accountId= — sitelinks + callouts per campaign (read).
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const rows = await fetchCampaignAssets(await getAdAccessToken(), accountId);
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Assets ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}

// POST — the write side. One action per call, session-gated, AuditLog'd.
//   { type: "add_sitelink", customerId, campaignId, linkText, finalUrl, description1?, description2? }
//   { type: "add_callout",  customerId, campaignId, text }
//   { type: "remove_asset", customerId, campaignAssetRn, label? }
//   { type: "create_conversion", customerId, name, category, valueEur? }
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const type = String(body.type ?? "");
  const customerId = String(body.customerId ?? "");
  if (!customerId) {
    return NextResponse.json({ error: "customerId ontbreekt" }, { status: 400 });
  }

  try {
    let summary: string;
    if (type === "add_sitelink") {
      const linkText = String(body.linkText ?? "").trim();
      const finalUrl = String(body.finalUrl ?? "").trim();
      if (!linkText || !finalUrl || linkText.length > 25) {
        return NextResponse.json({ error: "linkText (max 25) en finalUrl zijn verplicht" }, { status: 400 });
      }
      await addSitelink(customerId, String(body.campaignId), {
        linkText,
        finalUrl,
        description1: String(body.description1 ?? "").slice(0, 35),
        description2: String(body.description2 ?? "").slice(0, 35),
      });
      summary = `Sitelink "${linkText}" toegevoegd aan campagne`;
    } else if (type === "add_callout") {
      const text = String(body.text ?? "").trim();
      if (!text || text.length > 25) {
        return NextResponse.json({ error: "Callout-tekst verplicht (max 25 tekens)" }, { status: 400 });
      }
      await addCallout(customerId, String(body.campaignId), text);
      summary = `Callout "${text}" toegevoegd`;
    } else if (type === "remove_asset") {
      const rn = String(body.campaignAssetRn ?? "");
      if (!rn) return NextResponse.json({ error: "campaignAssetRn ontbreekt" }, { status: 400 });
      await removeCampaignAsset(customerId, rn);
      summary = `Asset verwijderd: ${String(body.label ?? rn)}`;
    } else if (type === "create_conversion") {
      const name = String(body.name ?? "").trim();
      const category = String(body.category ?? "DEFAULT");
      if (!name) return NextResponse.json({ error: "Naam verplicht" }, { status: 400 });
      const valueEur = body.valueEur != null && Number(body.valueEur) > 0 ? Number(body.valueEur) : null;
      await createConversionAction(customerId, { name, category, valueEur });
      summary = `Conversieactie "${name}" aangemaakt (${category})`;
    } else if (type === "generate_drafts") {
      // AI drafts sitelinks + callouts from the business profile. Returns
      // drafts only — nothing is saved until the user clicks save per item.
      const { getMemory } = await import("@/lib/ads-agent");
      const { callDeepSeekJSON } = await import("@/lib/deepseek");
      const mem = await getMemory();
      const site = String(body.site ?? "quicksolutions.be");
      const drafts = await callDeepSeekJSON<{
        sitelinks: { linkText: string; description1: string; description2: string }[];
        callouts: string[];
      }>({
        systemPrompt: `Je schrijft Google Ads-extensies voor een Belgische reparatieshop (Nederlands). Sitelink-titels max 25 tekens, beschrijvingen max 35 tekens, callouts max 25 tekens. Concreet en lokaal, geen uitroeptekens. Antwoord ALLEEN met JSON: {"sitelinks":[{"linkText":"","description1":"","description2":""},...],"callouts":["",...]} — 4 sitelinks, 6 callouts.`,
        userPrompt: `Website: ${site}\n\nBedrijfscontext:\n${[...mem.facts, ...mem.rules].join("\n") || "Geen extra context."}`,
        temperature: 0.5,
        maxTokens: 1200,
      });
      return NextResponse.json({ ok: true, drafts });
    } else {
      return NextResponse.json({ error: `Onbekend type: ${type}` }, { status: 400 });
    }

    await db.auditLog.create({
      data: {
        actorId: user.userId,
        action: `ads_assets_${type}`,
        entity: "ads",
        metadata: { summary, customerId },
      },
    });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { error: "Actie mislukt", details: String(err) },
      { status: 500 }
    );
  }
}
