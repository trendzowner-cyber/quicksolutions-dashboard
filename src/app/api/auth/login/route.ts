import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    let role: "admin" | "client" | null = null;
    if (password === process.env.DASHBOARD_PASSWORD) role = "admin";
    else if (password === process.env.CLIENT_PASSWORD) role = "client";

    if (!role) {
      return NextResponse.json(
        { error: "Ongeldig wachtwoord" },
        { status: 401 }
      );
    }

    const token = await createSession(role);
    const response = NextResponse.json({ success: true });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response.json();
  } catch {
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
