import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";

const SOCIAL_SYSTEM = `Je bent een social media marketeer voor quicksolutionspro.be. Genereer posts voor Facebook en Instagram.
REGELS:
- Nederlands (nl_BE)
- Platform-specifieke tone
- Facebook: 2-3 zinnen + call to action + link
- Instagram: korter, 1-2 emojis, hashtags (max 5), casual tone
- Vermeld: Refurbished kwaliteit, garantie, gratis verzending België
- Geen overdreven verkooppraat
ANTWOORD ALLEEN in JSON: {"facebook": "post tekst", "instagram": "post tekst", "hashtags": ["tag1","tag2"]}`;

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { productName, price, description, permalink } = await request.json();
    const result = await callDeepSeek({
      systemPrompt: SOCIAL_SYSTEM,
      userPrompt: `Product: ${productName}\nPrijs: ${price || "N/A"}\nBeschrijving: ${description?.slice(0, 300) || "N/A"}\nLink: ${permalink || "quicksolutionspro.be"}`,
      temperature: 0.7,
      maxTokens: 500,
    });
    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    return NextResponse.json(JSON.parse(cleaned.trim()));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
