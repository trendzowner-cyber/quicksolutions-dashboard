import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH { title?, category?, body?, sortOrder? } → update a template.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.category !== undefined) data.category = String(body.category).trim();
  if (body.body !== undefined) data.body = String(body.body).trim();
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Niets om te updaten" }, { status: 400 });
  }

  const template = await db.replyTemplate.update({ where: { id }, data });
  return NextResponse.json({ template });
}

// DELETE → remove a template.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await db.replyTemplate.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
