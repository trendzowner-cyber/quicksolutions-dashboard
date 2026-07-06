import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google-ads";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customerId = "480-889-6252"; // Google Shopping account
  const url = getAuthUrl(customerId);

  return NextResponse.json({ url });
}
