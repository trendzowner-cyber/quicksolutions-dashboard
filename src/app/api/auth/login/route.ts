import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!password || password !== process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json(
        { error: "Ongeldig wachtwoord" },
        { status: 401 }
      );
    }

    const token = await createSession();
    const response = NextResponse.json({ success: true });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
