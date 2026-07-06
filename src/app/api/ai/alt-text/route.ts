import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";

const ALT_TEXT_SYSTEM = `Je genereert alt-tekst voor productafbeeldingen van quicksolutionspro.be.
REGELS:
- Nederlands (nl_BE)
- Beschrijf het product en de staat (Refurbished)
- Max 15 woorden
- SEO-vriendelijk: bevat productnaam, model, kleur indien zichtbaar
- Geen "Afbeelding van" prefix
- Alleen de alt-tekst, geen JSON, geen uitleg`;

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { productName, imageUrl } = await request.json();
    const result = await callDeepSeek({
      systemPrompt: ALT_TEXT_SYSTEM,
      userPrompt: `Product: ${productName}\nGenereer een korte alt-tekst voor deze afbeelding.`,
      temperature: 0.3,
      maxTokens: 100,
    });
    return NextResponse.json({ altText: result.trim() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
