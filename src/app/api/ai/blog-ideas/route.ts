import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { BLOG_IDEAS_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { products } = await request.json();

    const catalogText =
      products && products.length > 0
        ? products.slice(0, 20).join(", ")
        : "Apple iPhone, MacBook, iPad, refurbished";

    const userPrompt = `PRODUCTCATALOGUS: ${catalogText}

Genereer blogpost-ideeën relevant voor deze producten.`;

    const result = await callDeepSeek({
      systemPrompt: BLOG_IDEAS_SYSTEM,
      userPrompt,
      temperature: 0.8,
      maxTokens: 2000,
    });

    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const data = JSON.parse(cleaned.trim());

    return NextResponse.json({
      ideas: data.ideas || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate blog ideas",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
