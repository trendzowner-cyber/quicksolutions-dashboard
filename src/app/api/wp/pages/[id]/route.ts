import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getPage, updatePage } from "@/lib/wp-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { data } = await getPage(parseInt(id));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch page", details: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { data } = await updatePage(parseInt(id), body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update page", details: String(error) },
      { status: 500 }
    );
  }
}
