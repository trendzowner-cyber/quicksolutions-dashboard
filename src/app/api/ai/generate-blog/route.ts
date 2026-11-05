import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { GENERATE_BLOG_SYSTEM } from "@/lib/prompts";
import { allowedUrls, formatLinkTargets, getLinkTargets } from "@/lib/seo-context";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Insert one internal link at the first plain-text occurrence of the anchor,
// never inside a tag, an existing link, or a heading. Splitting on tags keeps
// this from ever touching markup, which a naive replace on the whole HTML
// string cannot promise.
function autolinkFirst(html: string, anchor: string, url: string): string {
  const parts = html.split(/(<[^>]*>)/);
  const re = new RegExp(escapeRe(anchor), "i");
  let inHeading = false;
  let inAnchor = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.startsWith("<")) {
      const tag = part.toLowerCase();
      if (/^<h[1-6]\b/.test(tag)) inHeading = true;
      else if (/^<\/h[1-6]>/.test(tag)) inHeading = false;
      else if (/^<a\b/.test(tag)) inAnchor = true;
      else if (/^<\/a>/.test(tag)) inAnchor = false;
      continue;
    }
    if (inHeading || inAnchor) continue;
    const m = re.exec(part);
    if (!m) continue;
    parts[i] = part.slice(0, m.index) + `<a href="${url}">${m[0]}</a>` + part.slice(m.index + m[0].length);
    return parts.join("");
  }
  return html;
}

// Turn the model's [LINK:anchor] placeholders into real anchors, falling back
// to the first plain mention when no placeholder was written. The old code
// linked EVERY mention of every anchor text anywhere in the article — including
// inside attributes — which is how "professional" output ended up with the same
// product linked four times and URLs that did not exist.
function insertLinks(content: string, links: { anchorText: string; url: string }[]): string {
  let html = content;
  const placed = new Set<string>();

  for (const link of links) {
    const anchor = link.anchorText.trim();
    if (!anchor) continue;

    const placeholder = new RegExp(`\\[LINK:\\s*${escapeRe(anchor)}\\s*\\]`, "gi");
    if (placeholder.test(html)) {
      html = html.replace(placeholder, `<a href="${link.url}">${anchor}</a>`);
      placed.add(link.url);
    } else if (!placed.has(link.url) && !html.includes(`href="${link.url}"`)) {
      html = autolinkFirst(html, anchor, link.url);
      placed.add(link.url);
    }
  }

  // Any placeholder left over names an anchor we do not have a URL for.
  return html.replace(/\[LINK:[^\]]*\]/g, "");
}

// Relative internal hrefs → absolute; internal links to URLs that are not real
// targets get unwrapped (text kept, anchor dropped) instead of shipping a 404.
function sanitizeInternalAnchors(html: string, allowed: Set<string>, siteBase: string): string {
  const strip = (u: string) => u.replace(/\/+$/, "");
  return html.replace(/<a\b([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi, (full, pre, href, post, text) => {
    let url = href.trim();
    if (url.startsWith("/")) url = siteBase.replace(/\/+$/, "") + url;
    const isInternal = url.startsWith(siteBase);
    if (!isInternal) return full;
    if (allowed.size === 0) return `<a${pre}href="${url}"${post}>${text}</a>`;
    if (!allowed.has(strip(url))) return text;
    return `<a${pre}href="${url}"${post}>${text}</a>`;
  });
}

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { topic, keywords, tone } = await request.json();

    // The real catalog + existing posts: the article must interlink to pages
    // that exist, and to the blog cluster it belongs to.
    const targets = await getLinkTargets();
    const allowed = allowedUrls(targets);
    const siteBase = targets.posts[0]?.url
      ? new URL(targets.posts[0].url).origin
      : "https://quicksolutionspro.be";

    const userPrompt = `ONDERWERP: ${topic}
${keywords ? `EXTRA KERNWOORDEN: ${keywords}` : ""}
${tone ? `TOON: ${tone}` : "TOON: Informeel / behulpzaam"}

${formatLinkTargets(targets) || "LINKBARE DOELWITTEN: (geen beschikbaar — gebruik dan geen interne links)"}

Schrijf een premium SEO-geoptimaliseerde blogpost voor quicksolutionspro.be. Volg ALLE richtlijnen uit de systeemprompt.
Schrijf 3-5 interne links als [LINK:anchor tekst] placeholders, uitsluitend met doelen uit de lijst hierboven. Zet minstens één link naar een bestaande blogpost en één naar een product.`;

    const result = await callDeepSeek({
      systemPrompt: GENERATE_BLOG_SYSTEM,
      userPrompt,
      temperature: 0.7,
      // A full article + FAQ schema + link list lands around 5-6k tokens; the
      // old 4000 cut the JSON mid-string and the route threw "Unexpected end
      // of JSON input". deepseek-chat tops out at 8192 output tokens.
      maxTokens: 8000,
    });

    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const post = JSON.parse(cleaned.trim());

    // Only links the model actually chose AND that point at a real page.
    const rawLinks: unknown = post.internalLinks;
    const internalLinks: { anchorText: string; url: string }[] = Array.isArray(rawLinks)
      ? rawLinks
          .filter((l): l is { anchorText?: unknown; url?: unknown } => !!l && typeof l === "object")
          .map((l) => ({
            anchorText: typeof l.anchorText === "string" ? l.anchorText.trim() : "",
            url: typeof l.url === "string" ? l.url.trim() : "",
          }))
          .map((l) => ({
            anchorText: l.anchorText,
            url: l.url.startsWith("/") ? siteBase.replace(/\/+$/, "") + l.url : l.url,
          }))
          .filter((l) => l.anchorText && l.url && (allowed.size === 0 || allowed.has(l.url.replace(/\/+$/, ""))))
          // One link per URL: the model happily returns the same target twice
          // with two different anchors, which reads as keyword stuffing.
          .filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i)
      : [];

    let content = post.content || "";
    content = insertLinks(content, internalLinks);
    content = sanitizeInternalAnchors(content, allowed, siteBase);

    return NextResponse.json({
      title: post.title,
      slug: post.slug || "",
      content,
      excerpt: post.excerpt || "",
      metaDescription: post.metaDescription || "",
      focusKeyphrase: post.focusKeyphrase || "",
      seoTitle: post.seoTitle || "",
      internalLinks,
      imageSuggestions: post.imageSuggestions || [],
      faqSchema: post.faqSchema || [],
      tags: post.tags || [],
      category: post.category || "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate blog post", details: String(error) },
      { status: 500 }
    );
  }
}
