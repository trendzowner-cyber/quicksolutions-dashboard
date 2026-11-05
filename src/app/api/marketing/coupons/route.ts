import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { wcFetch } from "@/lib/wp-client";

// GET — List all coupons from WooCommerce
export async function GET() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, "marketing.view")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const { data } = await wcFetch<unknown[]>(
      "/coupons?per_page=50&orderby=date&order=desc"
    );
    return NextResponse.json({ coupons: data });
  } catch (error) {
    console.error("Coupons fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch coupons", details: String(error) },
      { status: 502 }
    );
  }
}

// POST — Create a new coupon
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, "marketing.manage")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { data } = await wcFetch<unknown>("/coupons", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json({ coupon: data }, { status: 201 });
  } catch (error) {
    console.error("Coupon create error:", error);
    return NextResponse.json(
      { error: "Failed to create coupon", details: String(error) },
      { status: 502 }
    );
  }
}
