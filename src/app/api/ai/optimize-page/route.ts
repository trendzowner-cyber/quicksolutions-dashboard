import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { OPTIMIZE_PAGE_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { pageId, title, content } = await request.json();

    const userPrompt = `PAGINA: ${title}
INHOUD: ${content?.slice(0, 3000) || "Geen inhoud"}

Optimaliseer deze pagina voor betere SEO en gebruikerservaring.`;

    const result = await callDeepSeek({
      systemPrompt: OPTIMIZE_PAGE_SYSTEM,
      userPrompt,
      temperature: 0.5,
      maxTokens: 3000,
    });

    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const data = JSON.parse(cleaned.trim());
    return NextResponse.json({
      title: data.title,
      content: data.content,
      metaDescription: data.metaDescription,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to optimize page", details: String(error) },
      { status: 500 }
    );
  }
}
