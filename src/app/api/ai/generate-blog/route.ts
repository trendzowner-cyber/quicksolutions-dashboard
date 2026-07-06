import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { GENERATE_BLOG_SYSTEM } from "@/lib/prompts";
import { getCategories } from "@/lib/wp-client";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { topic, keywords, tone } = await request.json();

    // Fetch real categories and recent products for context
    let contextData = "";
    try {
      const cats = await getCategories({ per_page: "20" });
      contextData = "\n\nBESCHIKBARE CATEGORIEËN: " + cats.data.map((c: Record<string, unknown>) => c.name).join(", ");
    } catch {}

    const userPrompt = `ONDERWERP: ${topic}
${keywords ? `EXTRA KERNWOORDEN: ${keywords}` : ""}
${tone ? `TOON: ${tone}` : "TOON: Informeel / behulpzaam"}${contextData}

Schrijf een premium SEO-geoptimaliseerde blogpost voor quicksolutionspro.be. Volg ALLE richtlijnen uit de systeemprompt.`;

    const result = await callDeepSeek({
      systemPrompt: GENERATE_BLOG_SYSTEM,
      userPrompt,
      temperature: 0.7,
      maxTokens: 4000,
    });

    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const post = JSON.parse(cleaned.trim());

    // Replace internal link placeholders with real URLs
    let content = post.content || "";
    if (post.internalLinks) {
      post.internalLinks.forEach((link: { anchorText: string; url: string }) => {
        content = content.replace(
          new RegExp(`\\[LINK:${link.anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g'),
          `<a href="https://quicksolutionspro.be${link.url}" title="${link.anchorText}">${link.anchorText}</a>`
        );
        // Also replace any text mentioning the product with a link
        if (!content.includes(`href="https://quicksolutionspro.be${link.url}"`)) {
          const escaped = link.anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(
            new RegExp(`(${escaped})(?![^<]*>|[^<>]*<\\/a>)`, 'gi'),
            `<a href="https://quicksolutionspro.be${link.url}">$1</a>`
          );
        }
      });
    }

    return NextResponse.json({
      title: post.title,
      slug: post.slug || "",
      content,
      excerpt: post.excerpt || "",
      metaDescription: post.metaDescription || "",
      focusKeyphrase: post.focusKeyphrase || "",
      seoTitle: post.seoTitle || "",
      internalLinks: post.internalLinks || [],
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
