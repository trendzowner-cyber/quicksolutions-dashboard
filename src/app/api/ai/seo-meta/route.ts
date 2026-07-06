import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { SEO_META_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, description, category } = await request.json();

    const userPrompt = `PRODUCT: ${title || "Onbekend"}
CATEGORIE: ${category || "Algemeen"}
KORTE BESCHRIJVING: ${description || "Geen beschrijving"}

Genereer optimale Yoast SEO metadata voor dit product.`;

    const result = await callDeepSeek({
      systemPrompt: SEO_META_SYSTEM,
      userPrompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const suggestion = JSON.parse(cleaned.trim());

    return NextResponse.json({
      metaDescription: suggestion.metaDescription,
      focusKeyphrase: suggestion.focusKeyphrase,
      seoTitle: suggestion.seoTitle,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate SEO meta",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
