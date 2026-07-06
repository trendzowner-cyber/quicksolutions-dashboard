import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { REDESIGN_PAGE_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { pageId, title, content, prompt } = await request.json();

    const userPrompt = `HUIDIGE PAGINA: "${title}"

ORIGINELE HTML CONTENT (BEHOUD ALLE INFO HIERIN, VOORAL TELEFOONNUMMERS, ADRESSEN, EMAILS, OPENINGSTIJDEN):
${content?.slice(0, 6000) || "Geen bestaande content"}

HERONTWERP PROMPT VAN GEBRUIKER:
${prompt || "Maak de pagina moderner en professioneler"}

Herontwerp de pagina. Behoud ALLE originele contactgegevens en bedrijfsinformatie.`;

    const result = await callDeepSeek({
      systemPrompt: REDESIGN_PAGE_SYSTEM,
      userPrompt,
      temperature: 0.6,
      maxTokens: 4000,
    });

    return NextResponse.json({
      content: result.trim(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to redesign page", details: String(error) },
      { status: 500 }
    );
  }
}
