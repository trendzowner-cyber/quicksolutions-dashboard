import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeekJSON } from "@/lib/deepseek";
import { BLOG_IDEAS_SYSTEM } from "@/lib/prompts";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { FOCUS_ANGLES } from "@/lib/blog-focus";
import {
  allowedUrls,
  formatExistingTitles,
  formatLinkTargets,
  getLinkTargets,
} from "@/lib/seo-context";

// ─── The idea generator ───
//
// Why this used to return the same ten titles on every click: the prompt was
// three sentences long, the only context was a hardcoded string ("Apple
// iPhone, MacBook, iPad, refurbished") — the panel never even sent products —
// and each batch DELETED the previous one, so the model had no memory of what
// it had already suggested. Temperature alone cannot buy variety.
//
// Now every batch gets:
//   • the real catalog + existing posts with their permalinks (link targets),
//   • the titles of every earlier batch and every published post (no repeats),
//   • one focus angle that rotates per batch,
// and the result is enriched with intent/content type/internal links so an
// idea is ready to write, not just a headline.

interface IdeaMeta {
  slug?: string;
  primaryKeyword?: string;
  intent?: string;
  contentType?: string;
  funnel?: string;
  priority?: number;
  internalLinks?: { anchorText: string; url: string }[];
  faqQuestions?: string[];
  focus?: string;
}

interface RawIdea {
  title?: string;
  slug?: string;
  description?: string;
  primaryKeyword?: string;
  targetKeywords?: unknown;
  intent?: string;
  contentType?: string;
  funnel?: string;
  priority?: unknown;
  internalLinks?: unknown;
  faqQuestions?: unknown;
}

interface StoredIdea {
  title: string;
  description: string;
  targetKeywords: string[];
  meta: IdeaMeta | null;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return norm(s).replace(/\s+/g, "-").slice(0, 80) || "blogpost";
}

function asStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, max);
}

function asLinks(value: unknown, allowed: Set<string>, siteBase: string): { anchorText: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  const strip = (u: string) => u.replace(/\/+$/, "");
  const out: { anchorText: string; url: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const link = item as { anchorText?: unknown; url?: unknown };
    if (typeof link.anchorText !== "string" || typeof link.url !== "string") continue;
    let url = link.url.trim();
    // The model sometimes returns a site-relative path — make it absolute so
    // it can be compared against the real permalinks.
    if (url.startsWith("/")) url = siteBase.replace(/\/+$/, "") + url;
    if (!allowed.has(strip(url))) continue; // invented URL → dropped
    out.push({ anchorText: link.anchorText.trim(), url });
    if (out.length >= 3) break;
  }
  return out;
}

function toMeta(idea: RawIdea, focus: string, allowed: Set<string>, siteBase: string): IdeaMeta {
  return {
    slug: (idea.slug || slugify(idea.title ?? "")).trim(),
    primaryKeyword: typeof idea.primaryKeyword === "string" ? idea.primaryKeyword.trim() : "",
    intent: typeof idea.intent === "string" ? idea.intent.trim() : "",
    contentType: typeof idea.contentType === "string" ? idea.contentType.trim() : "",
    funnel: typeof idea.funnel === "string" ? idea.funnel.trim() : "",
    priority: typeof idea.priority === "number" ? idea.priority : Number(idea.priority) || 3,
    internalLinks: asLinks(idea.internalLinks, allowed, siteBase),
    faqQuestions: asStringArray(idea.faqQuestions, 4),
    focus,
  };
}

function readMeta(value: unknown): IdeaMeta | null {
  if (!value || typeof value !== "object") return null;
  return value as IdeaMeta;
}

async function loadStoredIdeas(limit: number): Promise<StoredIdea[]> {
  const rows = await db.blogIdea.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    title: r.title,
    description: r.description,
    targetKeywords: r.targetKeywords,
    meta: readMeta(r.meta),
  }));
}

// ─── POST — generate a NEW batch (appends; never wipes the history) ───
export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requestedFocus = typeof body?.focus === "string" ? body.focus.trim() : "";
    const count = Math.min(12, Math.max(5, Number(body?.count) || 10));

    const [targets, stored, totalIdeas] = await Promise.all([
      getLinkTargets(),
      loadStoredIdeas(120),
      db.blogIdea.count(),
    ]);
    const siteBase = targets.posts[0]?.url ? new URL(targets.posts[0].url).origin : "https://quicksolutionspro.be";

    // Focus rotates relative to the LAST batch, not to a modulo of the total:
    // batches are 10 ideas and the angle list has 10 entries, so
    // `totalIdeas % 10` picked the same angle on every batch.
    const lastFocus = stored.find((s) => s.meta?.focus)?.meta?.focus ?? "";
    const lastIdx = FOCUS_ANGLES.indexOf(lastFocus);
    const focus =
      requestedFocus ||
      (lastIdx >= 0
        ? FOCUS_ANGLES[(lastIdx + 1) % FOCUS_ANGLES.length]
        : FOCUS_ANGLES[Math.floor(totalIdeas / 10) % FOCUS_ANGLES.length]);

    const priorTitles = stored.map((s) => s.title);
    const allowed = allowedUrls(targets);

    function buildPrompt(batchSize: number): string {
      return [
        `FOCUS VOOR DEZE BATCH: ${focus}`,
        "",
        `REEDS GEPUBLICEERD — NOOIT DUPLICEREN (${targets.posts.length}):`,
        formatExistingTitles(targets) || "(geen)",
        "",
        `EERDER VOORGESTELD — NOOIT HERHALEN (${priorTitles.length}):`,
        priorTitles.length > 0
          ? priorTitles.map((t) => `- ${t}`).join("\n")
          : "(geen)",
        "",
        "LINKBARE DOELWITTEN (alleen deze URL's mag je gebruiken):",
        formatLinkTargets(targets) || "(geen doelen beschikbaar — laat internalLinks dan leeg)",
        "",
        `Genereer ${batchSize} nieuwe blogideeën die exact onder deze focus vallen, verspreid over minstens 4 contentTypes en meerdere funnel-fases. Elk idee moet iets toevoegen dat nog niet in de lijsten hierboven staat.`,
      ].join("\n");
    }

    // An enriched batch (links + FAQ + keywords per idea) is long: at 3200
    // output tokens the model's JSON was cut mid-string and the whole call
    // failed. Give it room, and if the reply is still truncated, retry once
    // with a smaller batch instead of showing the owner an error.
    let rawIdeas: RawIdea[] = [];
    let firstError: unknown = null;
    for (const batchSize of [count, Math.max(4, count - 3)]) {
      try {
        const result = await callDeepSeekJSON<{ ideas?: RawIdea[] }>({
          systemPrompt: BLOG_IDEAS_SYSTEM,
          userPrompt: buildPrompt(batchSize),
          temperature: 0.9,
          maxTokens: 6000,
        });
        rawIdeas = Array.isArray(result.ideas) ? result.ideas : [];
        break;
      } catch (err) {
        if (!firstError) firstError = err;
        if (batchSize === Math.max(4, count - 3)) throw firstError;
      }
    }

    // Drop empties and anything that repeats a title/keyphrase we already have.
    const seen = new Set(stored.map((s) => norm(s.title)));
    const seenKeywords = new Set(
      stored.map((s) => norm(s.meta?.primaryKeyword ?? "")).filter(Boolean)
    );
    const fresh: { title: string; description: string; targetKeywords: string[]; meta: IdeaMeta }[] = [];
    let skipped = 0;

    for (const raw of rawIdeas) {
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      if (!title) continue;
      const key = norm(title);
      const primaryKeyword = typeof raw.primaryKeyword === "string" ? raw.primaryKeyword.trim() : "";
      const kwKey = norm(primaryKeyword);
      if (seen.has(key) || (kwKey && seenKeywords.has(kwKey))) {
        skipped++;
        continue;
      }
      seen.add(key);
      if (kwKey) seenKeywords.add(kwKey);

      const meta = toMeta(raw, focus, allowed, siteBase);
      fresh.push({
        title,
        description: typeof raw.description === "string" ? raw.description.trim() : "",
        targetKeywords: asStringArray(raw.targetKeywords, 8),
        meta,
      });
      if (fresh.length >= count) break;
    }

    if (fresh.length > 0) {
      await db.blogIdea.createMany({
        data: fresh.map((f) => ({
          title: f.title,
          description: f.description,
          targetKeywords: f.targetKeywords,
          meta: f.meta as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    const merged = await loadStoredIdeas(40);
    return NextResponse.json({
      ideas: merged,
      generated: fresh.length,
      skipped,
      focus,
      linkTargets: { products: allowed.size, posts: targets.posts.length },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate blog ideas", details: String(error) },
      { status: 500 }
    );
  }
}

// ─── GET — the saved ideas (enriched meta included) ───
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ideas = await loadStoredIdeas(40);
    return NextResponse.json({ ideas });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load blog ideas", details: String(error) },
      { status: 500 }
    );
  }
}
