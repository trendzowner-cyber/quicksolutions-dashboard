import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { IMPROVE_DESCRIPTION_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { currentDescription, shortDescription, title, attributes } =
      await request.json();

    const userPrompt = `PRODUCT: ${title || "Onbekend"}
HUIDIGE BESCHRIJVING: ${currentDescription || "Geen beschrijving"}
HUIDIGE KORTE BESCHRIJVING: ${shortDescription || "Geen"}
SPECIFICATIES: ${attributes || "Niet beschikbaar"}

Herschrijf de productbeschrijving om de conversie te verhogen.`;

    const result = await callDeepSeek({
      systemPrompt: IMPROVE_DESCRIPTION_SYSTEM,
      userPrompt,
      temperature: 0.7,
      maxTokens: 2000,
    });

    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const suggestion = JSON.parse(cleaned.trim());

    return NextResponse.json({
      suggestion: suggestion.description,
      shortDescription: suggestion.shortDescription,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate description suggestion",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
