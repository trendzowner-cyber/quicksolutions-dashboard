import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-ads";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  // Return full URL for debugging
  const fullUrl = request.nextUrl.toString();

  if (error) {
    return NextResponse.json(
      { error: `OAuth error: ${error}`, url: fullUrl },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json({
      error: "No code provided",
      url: fullUrl,
      allParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
    });
  }

  try {
    const tokens = await exchangeCode(code);
    return NextResponse.json({
      success: true,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to exchange code", details: String(err) },
      { status: 500 }
    );
  }
}
