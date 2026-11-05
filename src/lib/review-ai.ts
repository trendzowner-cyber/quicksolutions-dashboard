// Shared AI triage + alerting for reviews (Google-synced or manually added).

import { db } from "@/lib/db";
import { callDeepSeek } from "@/lib/deepseek";

// Scores a review and stores the verdict, returning the fake-score so the
// caller can fold it into its own alert. Deliberately does NOT notify on its
// own — alerting belongs to the caller, so a single review can never produce
// two Telegram messages.
export async function scoreAndAlert(
  googleReviewId: string,
  comment: string | null,
  rating: number
): Promise<number | null> {
  // AI verdict on whether this low review looks fake/malicious.
  let score: number | null = null;
  let flags: { flag: string; reason: string }[] = [];
  try {
    const systemPrompt =
      "Je beoordeelt Google-reviews van een Belgische webshop (QuickSolutionsPro, refurbished Apple/elektronica). " +
      "Geef een score 0-100: hoe waarschijnlijk is deze review nep/malicious (concurrent, wraak, bot, klacht zonder enig specifiek detail, verkeerd bedrijf)? " +
      "Antwoord UITSLUITEND als JSON: {\"score\": <getal 0-100>, \"flags\": [{\"flag\": \"korte label\", \"reason\": \"1 zin waarom\"}]}. Geen andere tekst.";
    const userPrompt = `Sterren: ${rating}/5\nReviewtekst: ${comment && comment.trim() ? comment : "(geen tekst)"}`;
    const raw = await callDeepSeek({ systemPrompt, userPrompt, temperature: 0.2, maxTokens: 300 });
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.score === "number") {
      score = Math.max(0, Math.min(100, Math.round(parsed.score)));
      flags = Array.isArray(parsed.flags) ? parsed.flags.slice(0, 5) : [];
    }
  } catch {
    score = null;
  }

  await db.googleReview.update({
    where: { googleReviewId },
    data: { aiFakeScore: score, aiFlags: flags.length ? flags : undefined, aiScoredAt: new Date() },
  });

  return score;
}
