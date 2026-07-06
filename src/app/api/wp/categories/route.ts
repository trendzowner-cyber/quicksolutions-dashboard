import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getCategories } from "@/lib/wp-client";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data } = await getCategories({ per_page: "100" });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch categories", details: String(error) },
      { status: 500 }
    );
  }
}
