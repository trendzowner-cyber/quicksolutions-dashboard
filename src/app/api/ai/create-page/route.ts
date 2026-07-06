import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { CREATE_PAGE_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, prompt } = await request.json();

    const userPrompt = `NIEUWE PAGINA: "${title}"

GEBRUIKER PROMPT:
${prompt || `Maak een professionele pagina over ${title}`}

Maak een volledig nieuwe WordPress pagina.`;

    const result = await callDeepSeek({
      systemPrompt: CREATE_PAGE_SYSTEM,
      userPrompt,
      temperature: 0.7,
      maxTokens: 4000,
    });

    // Parse JSON response
    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const data = JSON.parse(cleaned.trim());

    return NextResponse.json({
      title: data.title || title,
      content: data.content || "",
      metaDescription: data.metaDescription || "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create page", details: String(error) },
      { status: 500 }
    );
  }
}
