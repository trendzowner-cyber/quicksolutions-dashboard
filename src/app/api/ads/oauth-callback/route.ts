import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-ads";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.json(
      { error: `OAuth error: ${error}` },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    const tokens = await exchangeCode(code);
    return NextResponse.json({
      success: true,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      message:
        "Copy the refresh_token value and add it to GOOGLE_ADS_REFRESH_TOKEN env var",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to exchange code", details: String(err) },
      { status: 500 }
    );
  }
}
