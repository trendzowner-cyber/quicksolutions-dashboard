import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { GENERATE_BLOG_SYSTEM } from "@/lib/prompts";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { topic, keywords, tone } = await request.json();

    const userPrompt = `ONDERWERP: ${topic}
${keywords ? `EXTRA KERNWOORDEN: ${keywords}` : ""}
${tone ? `TOON: ${tone}` : "TOON: Informeel / behulpzaam"}

Schrijf een SEO-geoptimaliseerde blogpost voor quicksolutionspro.be.`;

    const result = await callDeepSeek({
      systemPrompt: GENERATE_BLOG_SYSTEM,
      userPrompt,
      temperature: 0.7,
      maxTokens: 4000,
    });

    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

    const post = JSON.parse(cleaned.trim());

    return NextResponse.json({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      metaDescription: post.metaDescription,
      focusKeyphrase: post.focusKeyphrase,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate blog post",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
