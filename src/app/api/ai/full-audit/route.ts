import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";
import { AUDIT_ITEM_SYSTEM } from "@/lib/prompts";
import type { AuditIssue } from "@/types/audit";

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { items } = await request.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ issues: [] });
    }

    // Process items in batches of 5 to stay within context limits
    const batchSize = 5;
    const issues: AuditIssue[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const itemsText = batch
        .map(
          (item: { id: number; type: string; title: string; metaDescription?: string; contentLength?: number },
            idx: number) =>
            `[ITEM ${idx + 1}]
ID: ${item.id}
Type: ${item.type}
Titel: ${item.title}
${item.metaDescription ? `Meta: ${item.metaDescription}` : "Meta: GEEN"}
Content lengte: ~${item.contentLength || 0} woorden`
        )
        .join("\n\n");

      const userPrompt = `Analyseer de volgende content items op SEO problemen:\n\n${itemsText}`;

      try {
        const result = await callDeepSeek({
          systemPrompt: AUDIT_ITEM_SYSTEM,
          userPrompt,
          temperature: 0.3,
          maxTokens: 3000,
        });

        let cleaned = result.trim();
        if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
        else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
        if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

        const batchIssues = JSON.parse(cleaned.trim());
        if (Array.isArray(batchIssues)) {
          batchIssues.forEach((issue, idx) => {
            if (batch[idx]) {
              issues.push({
                itemId: batch[idx].id,
                itemType: batch[idx].type,
                itemTitle: batch[idx].title,
                severity: issue.severity || "low",
                category: issue.category || "seo_opportunity",
                description: issue.description || "",
                suggestion: issue.suggestion || "",
              });
            }
          });
        }
      } catch {
        // Skip failed batch, continue with next
      }
    }

    return NextResponse.json({ issues });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to run audit", details: String(error) },
      { status: 500 }
    );
  }
}
