// Turns a spoken instruction into an English task draft.
//
// The browser does the listening (Web Speech API — free, built in, no vendor),
// so by the time a request arrives here all that is left is the part DeepSeek
// is good at: translating into English and turning a sentence into fields.
// Either language is accepted — Dutch from the client, English from anyone who
// works that way — and the task always comes out in English for the person who
// has to read it.
//
// Nothing is created here. The draft goes back to the dialog for the client to
// read and correct, because a misheard deadline must never reach the board
// silently.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { callDeepSeekJSON } from "@/lib/deepseek";
import { TASK_CATEGORIES, PRIORITY_KEYS, normalizePriority } from "@/lib/tasks";
import { brusselsNow, dayLabelEN, formatISOLongEN, formatMinutes, parseTimeToMinutes } from "@/lib/recurring";
import { validDays } from "@/app/api/recurring-tasks/route";

export const maxDuration = 30;

interface VoiceDraft {
  title?: string;
  description?: string;
  dueDate?: string | null;
  priority?: string;
  category?: string;
}

interface RecurringDraft {
  title?: string;
  description?: string;
  days?: unknown;
  deadline?: string;
  priority?: string;
  category?: string;
}

/** YYYY-MM-DD, inside a sane window, or nothing. A model that returns
 *  "volgende week" as a date must not put that string on the board. */
function validDate(value: unknown, today: string): string | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (Number.isNaN(new Date(`${value}T12:00:00Z`).getTime())) return null;
  // A year either side of today is generous; anything else is a parse error.
  const [y] = today.split("-").map(Number);
  const year = Number(value.slice(0, 4));
  return year >= y - 1 && year <= y + 1 ? value : null;
}

// The recurring half of the same idea: "laat Kerim elke werkdag om vijf uur de
// nieuwe Google reviews controleren" is not a task, it is an obligation, and it
// has no date — it has weekdays and a time of day. Same rule as above applies:
// this only ever returns a draft for someone to confirm.

const DEFAULT_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_DEADLINE = "17:00";

async function recurringDraft(
  transcript: string,
  heardEnglish: boolean,
  today: { date: string; isoDay: number },
  assignee?: string
) {
  const draft = await callDeepSeekJSON<RecurringDraft>({
    systemPrompt:
      "You turn a spoken instruction into ONE task that repeats on a weekly " +
      "schedule for a colleague. The speaker is " +
      (heardEnglish
        ? "speaking ENGLISH.\n"
        : "speaking DUTCH (Flemish), but may switch to English mid-sentence.\n") +
      `Today is ${today.date} (${dayLabelEN(today.isoDay)}, ${formatISOLongEN(today.date)}).\n` +
      (assignee ? `The task is for ${assignee}.\n` : "") +
      "Write title and description in ENGLISH. If it was spoken in Dutch, " +
      "translate the meaning rather than word for word; if it was already " +
      "English, tidy it up without rewording it into something else. " +
      "The title is a short imperative: " +
      '"Check the new Google reviews", not "Kerim must check...".\n' +
      "days: the weekdays it repeats on, as numbers, Monday=1 through Sunday=7. " +
      '"every weekday" -> [1,2,3,4,5]; "every day" -> [1,2,3,4,5,6,7]; ' +
      '"every monday" -> [1]; "on tuesday and thursday" -> [2,4]; ' +
      `"every weekend" -> [6,7]. If no day was spoken, use ${JSON.stringify(DEFAULT_DAYS)}.\n` +
      "deadline: the time of day it must be finished as \"HH:MM\" in 24-hour " +
      "time. These are working hours, so a bare \"om vijf uur\" means 17:00, " +
      "not 05:00. Use " +
      `"${DEFAULT_DEADLINE}" if no time was spoken.\n` +
      `priority: one of ${PRIORITY_KEYS.join(", ")}. Default "normal".\n` +
      `category: one of ${TASK_CATEGORIES.join(", ")}. Default "algemeen".\n` +
      "Answer with JSON ONLY: " +
      `{"title": "short English title", "description": "1 sentence of context", "days": ${JSON.stringify(DEFAULT_DAYS)}, "deadline": "${DEFAULT_DEADLINE}", "priority": "normal", "category": "algemeen"}. ` +
      "No other text.",
    userPrompt: transcript,
    temperature: 0.2,
    maxTokens: 400,
  });

  const title = (draft.title ?? "").trim().slice(0, 200);
  if (!title) {
    return NextResponse.json(
      { error: "Kon hier geen duidelijke taak van maken" },
      { status: 422 }
    );
  }

  // Both fall back to the default the prompt already stated rather than
  // failing: the composer shows the days and the time as controls before
  // anything is saved, so a wrong guess is visible and one tap from fixed.
  const days = validDays(draft.days);
  const minutes = parseTimeToMinutes(String(draft.deadline ?? ""));

  return NextResponse.json({
    title,
    description: draft.description?.trim().slice(0, 2000) || null,
    days: days.length ? days : DEFAULT_DAYS,
    deadline: minutes === null ? DEFAULT_DEADLINE : formatMinutes(minutes),
    priority: normalizePriority(draft.priority),
    category: (TASK_CATEGORIES as readonly string[]).includes(String(draft.category))
      ? String(draft.category)
      : "algemeen",
    transcript,
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      transcript?: string;
      assignee?: string;
      lang?: string;
      mode?: string;
    };
    const transcript = body.transcript?.trim().slice(0, 1000);
    if (!transcript) {
      return NextResponse.json({ error: "Geen spraak herkend" }, { status: 400 });
    }

    // The browser knows which language it listened for; it is only a hint, and
    // the model is told to cope either way.
    const heardEnglish = body.lang?.startsWith("en") ?? false;

    const today = brusselsNow();

    // Repeating or one-off is the speaker's choice made before talking, not
    // something to infer from the sentence — "check the reviews every day" and
    // "check the reviews today" differ by one word and produce different rows.
    if (body.mode === "recurring") {
      return await recurringDraft(transcript, heardEnglish, today, body.assignee);
    }

    const draft = await callDeepSeekJSON<VoiceDraft>({
      systemPrompt:
        "You turn a spoken instruction into ONE task for a colleague. The speaker is " +
        (heardEnglish
          ? "speaking ENGLISH.\n"
          : "speaking DUTCH (Flemish), but may switch to English mid-sentence.\n") +
        `Today is ${today.date} (${dayLabelEN(today.isoDay)}, ${formatISOLongEN(today.date)}).\n` +
        (body.assignee ? `The task is for ${body.assignee}.\n` : "") +
        // Almost every instruction is a bare "do this" with no date attached.
        // The content is the whole point, so the deadline is described last and
        // null is stated as the normal answer rather than a fallback.
        "Write title and description in ENGLISH. If it was spoken in Dutch, " +
        "translate the meaning rather than word for word; if it was already " +
        "English, tidy it up without rewording it into something else. " +
        "The title is a short imperative: " +
        '"Order screen protectors for iPhone 16", not "Kerim must order...". ' +
        "The description carries whatever detail the title cannot fit.\n" +
        "dueDate: null unless a deadline was actually spoken. Most instructions have " +
        "none, so null is the normal answer and a guessed date is worse than no date. " +
        "When a date IS spoken, resolve it to a real calendar date as YYYY-MM-DD" +
        ' ("tomorrow" -> the date after today, "next friday" -> that friday).\n' +
        `priority: one of ${PRIORITY_KEYS.join(", ")}. Default "normal".\n` +
        `category: one of ${TASK_CATEGORIES.join(", ")}. Default "algemeen".\n` +
        "Answer with JSON ONLY: " +
        '{"title": "short English title", "description": "1 sentence of context", "dueDate": null, "priority": "normal", "category": "algemeen"}. ' +
        "No other text.",
      userPrompt: transcript,
      temperature: 0.2,
      maxTokens: 400,
    });

    const title = (draft.title ?? "").trim().slice(0, 200);
    if (!title) {
      return NextResponse.json(
        { error: "Kon hier geen duidelijke taak van maken" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      title,
      description: draft.description?.trim().slice(0, 2000) || null,
      dueDate: validDate(draft.dueDate, today.date),
      priority: normalizePriority(draft.priority),
      category: (TASK_CATEGORIES as readonly string[]).includes(String(draft.category))
        ? String(draft.category)
        : "algemeen",
      // Echoed back so the client can see what was actually heard, in Dutch,
      // next to the English it became.
      transcript,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Spraak verwerken mislukt", details: String(error).slice(0, 200) },
      { status: 500 }
    );
  }
}
