import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized, UNAUTHORIZED } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { searchCreatives, storeAds } from "@/lib/ads-transparency";
import { sendTelegram } from "@/lib/telegram";

export const maxDuration = 300;

// POST /api/ads/competitors/sync — daily cron (pg_cron, X-Sync-Secret).
// Re-pulls every tracked competitor and alerts on Telegram when a competitor
// publishes creatives we haven't seen before.
export async function POST(request: NextRequest) {
  if (!(await cronAuthorized(request))) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  const competitors = await db.competitor.findMany();
  const results: { domain: string; stored: number; fresh: number; error?: string }[] = [];

  for (const comp of competitors) {
    try {
      const ads = await searchCreatives(
        comp.advertiserId
          ? { advertiserId: comp.advertiserId, maxPages: 1 }
          : { domain: comp.domain, maxPages: 1 }
      );
      const { stored, fresh } = await storeAds(comp.id, ads);

      if (fresh.length) {
        const lines = fresh
          .slice(0, 3)
          .map((a) => `• ${a.format} — ${a.link}`)
          .join("\n");
        await sendTelegram(
          `🆕 <b>${comp.name ?? comp.domain}</b> heeft ${fresh.length} nieuwe advertentie${fresh.length > 1 ? "s" : ""}:\n${lines}` +
            (fresh.length > 3 ? `\n… en ${fresh.length - 3} meer — zie dashboard.` : "")
        );
      }
      results.push({ domain: comp.domain, stored, fresh: fresh.length });
    } catch (error) {
      results.push({ domain: comp.domain, stored: 0, fresh: 0, error: String(error) });
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, results });
}
