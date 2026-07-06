import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getProduct, updateProduct, getSEOMeta, updateSEOMeta } from "@/lib/wp-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { data: product } = await getProduct(parseInt(id));

    // Try to get Yoast SEO meta
    let seoMeta = null;
    try {
      seoMeta = await getSEOMeta(parseInt(id), "product");
    } catch {
      // Yoast meta might not exist for this product
    }

    return NextResponse.json({ ...product, yoast_seo: seoMeta });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch product", details: String(error) },
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
    const { data } = await updateProduct(parseInt(id), body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update product", details: String(error) },
      { status: 500 }
    );
  }
}
