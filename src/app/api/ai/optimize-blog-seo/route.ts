import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { OPTIMIZE_BLOG_SEO_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { postId, title, content } = await request.json();

    const userPrompt = `BLOG POST ID: ${postId}
TITEL: ${title}
INHOUD (samengevat): ${content?.slice(0, 2000) || "Geen inhoud"}

Analyseer deze blog post en stel SEO verbeteringen voor.`;

    const result = await callDeepSeek({
      systemPrompt: OPTIMIZE_BLOG_SEO_SYSTEM,
      userPrompt,
      temperature: 0.3,
      maxTokens: 2000,
    });

    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const data = JSON.parse(cleaned.trim());
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to optimize blog SEO", details: String(error) },
      { status: 500 }
    );
  }
}
