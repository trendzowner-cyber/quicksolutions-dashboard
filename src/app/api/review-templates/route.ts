import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_TEMPLATES } from "@/lib/reply-templates";

// GET → all reply templates (seeded with the Dutch defaults on first read).
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let templates = await db.replyTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  if (templates.length === 0) {
    await db.replyTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
    });
    templates = await db.replyTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  }

  return NextResponse.json({ templates });
}

// POST { title, category, body } → add a template.
export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!title || !text) {
    return NextResponse.json({ error: "Titel en tekst zijn verplicht" }, { status: 400 });
  }

  const template = await db.replyTemplate.create({
    data: {
      title,
      category: String(body.category ?? "algemeen").trim() || "algemeen",
      body: text,
      sortOrder: (body.sortOrder as number) ?? 0,
    },
  });
  return NextResponse.json({ template });
}
