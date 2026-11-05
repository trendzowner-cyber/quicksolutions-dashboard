import { NextResponse } from "next/server";
import { createSession, verifyPassword, getUserByEmail, getUserByUsername } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";

// Rate limiting map (in-memory, reset on server restart)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(request: Request) {
  try {
    const { login, password } = await request.json();

    if (!login || !password) {
      return NextResponse.json(
        { error: "Gebruikersnaam/e-mail en wachtwoord zijn verplicht" },
        { status: 400 }
      );
    }

    // Rate limiting by IP + login
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const key = `${ip}:${login}`;
    const attempt = loginAttempts.get(key);

    if (attempt && attempt.count >= MAX_ATTEMPTS && Date.now() < attempt.resetAt) {
      const minutesLeft = Math.ceil((attempt.resetAt - Date.now()) / 60000);
      return NextResponse.json(
        { error: `Te veel pogingen. Probeer opnieuw over ${minutesLeft} minuten.` },
        { status: 429 }
      );
    }

    // Try to find user by email first, then username
    let user = await getUserByEmail(login);
    if (!user) {
      user = await getUserByUsername(login);
    }
    // Usernames are stored exactly as created ("Kerim"), but nobody types the
    // capital reliably on a phone keyboard — fall back to a case-insensitive
    // match before giving up.
    if (!user) {
      user = await db.user.findFirst({
        where: { username: { equals: login, mode: "insensitive" } },
      });
    }

    // Fallback: legacy shared password support (for backward compatibility during migration)
    if (!user && process.env.DASHBOARD_PASSWORD) {
      if (password === process.env.DASHBOARD_PASSWORD) {
        // Auto-create owner account from legacy password
        const hashedPw = await (await import("bcryptjs")).default.hash(password, 12);
        user = await db.user.upsert({
          where: { email: "owner@quicksolutionspro.be" },
          update: { lastLoginAt: new Date() },
          create: {
            name: "Owner",
            username: "owner",
            email: "owner@quicksolutionspro.be",
            passwordHash: hashedPw,
            role: "owner",
            lastLoginAt: new Date(),
          },
        });
      } else if (password === process.env.CLIENT_PASSWORD) {
        // Auto-create viewer account from legacy client password
        const hashedPw = await (await import("bcryptjs")).default.hash(password, 12);
        user = await db.user.upsert({
          where: { email: "client@quicksolutionspro.be" },
          update: { lastLoginAt: new Date() },
          create: {
            name: "Client",
            username: "client",
            email: "client@quicksolutionspro.be",
            passwordHash: hashedPw,
            role: "viewer",
            lastLoginAt: new Date(),
          },
        });
      }
    }

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      // Record failed attempt
      if (!attempt || Date.now() >= attempt.resetAt) {
        loginAttempts.set(key, { count: 1, resetAt: Date.now() + LOCKOUT_MINUTES * 60000 });
      } else {
        attempt.count++;
      }

      await logAudit("login_failed", null, "auth", login);
      return NextResponse.json(
        { error: "Ongeldige inloggegevens" },
        { status: 401 }
      );
    }

    // Check if user is disabled
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "Dit account is uitgeschakeld. Neem contact op met de beheerder." },
        { status: 403 }
      );
    }

    // Clear rate limit on success
    loginAttempts.delete(key);

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await logAudit("login_success", user.id, "user", user.id);

    // Long session for everyone — see createSession.
    const token = await createSession(user.id, user.role);
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // Must match the token's own lifetime above, or the browser drops the
      // cookie while the token inside is still perfectly valid.
      maxAge: 60 * 60 * 24 * 90,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
