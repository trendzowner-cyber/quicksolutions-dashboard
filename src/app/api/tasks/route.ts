import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionRole } from "@/lib/auth";
import { wpFetch } from "@/lib/wp-client";

const TASK_PAGE_SLUG = "_dashboard_tasks";
const WP_API = process.env.WP_API_URL!;

function wpAuth() {
  return Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString("base64");
}

async function getTaskPage() {
  try {
    const res = await fetch(`${WP_API}/pages?slug=${TASK_PAGE_SLUG}`, {
      headers: { Authorization: `Basic ${wpAuth()}` },
    });
    const pages = await res.json();
    if (pages.length > 0) return pages[0];
    // Create the hidden page
    const createRes = await fetch(`${WP_API}/pages`, {
      method: "POST",
      headers: { Authorization: `Basic ${wpAuth()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Task Data", slug: TASK_PAGE_SLUG, status: "private",
        content: JSON.stringify({ tasks: [], sessions: [], defaultCategories: [] }),
      }),
    });
    return createRes.json();
  } catch { return null; }
}

async function saveTaskPage(id: number, data: Record<string, unknown>) {
  await fetch(`${WP_API}/pages/${id}`, {
    method: "PUT",
    headers: { Authorization: `Basic ${wpAuth()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: JSON.stringify(data) }),
  });
}

export async function GET(request: NextRequest) {
  if (!(await verifySession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const page = await getTaskPage();
    if (!page) return NextResponse.json({ tasks: [], sessions: [], defaultCategories: [] });
    const data = JSON.parse(page.content?.raw || page.content?.rendered || "{}");
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ tasks: [], sessions: [], defaultCategories: [] });
  }
}

export async function POST(request: NextRequest) {
  const role = await getSessionRole();
  if (role !== "admin") return NextResponse.json({ error: "Alleen admin kan taken bewerken" }, { status: 403 });
  try {
    const body = await request.json();
    const page = await getTaskPage();
    if (!page) return NextResponse.json({ error: "Storage error" }, { status: 500 });

    const current = JSON.parse(page.content?.raw || page.content?.rendered || "{}");
    const merged = { ...current, ...body };
    await saveTaskPage(page.id, merged);
    return NextResponse.json(merged);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
