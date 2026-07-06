import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { IMPROVE_TITLE_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { currentTitle, description, brand, model } = await request.json();

    const userPrompt = `HUIDIGE TITEL: ${currentTitle}
${description ? `HUIDIGE BESCHRIJVING: ${description}` : ""}
${brand ? `MERK: ${brand}` : ""}
${model ? `MODEL: ${model}` : ""}

Genereer een verbeterde producttitel.`;

    const result = await callDeepSeek({
      systemPrompt: IMPROVE_TITLE_SYSTEM,
      userPrompt,
      temperature: 0.3,
      maxTokens: 300,
    });

    // Parse JSON from DeepSeek response
    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const suggestion = JSON.parse(cleaned.trim());

    return NextResponse.json({
      suggestion: suggestion.title,
      reasoning: suggestion.reasoning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate title suggestion", details: String(error) },
      { status: 500 }
    );
  }
}
