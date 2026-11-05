import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// GET — List all users (requires users.view permission)
//
// ?scope=assignable is the exception: picking an assignee on the task board
// needs a name and an id, not the full directory, and previously the whole
// dropdown came back empty for anyone without users.view.
export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.role, "users.view")) {
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope !== "assignable") {
      return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
    }
    const assignable = await db.user.findMany({
      where: { status: "active" },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ users: assignable });
  }

  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        status: true,
        avatarUrl: true,
        groupId: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt?.toISOString() || null,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Kan gebruikers niet laden", details: String(error) },
      { status: 500 }
    );
  }
}

// POST — Create a new user (requires users.create permission)
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "users.create")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const { name, username, email, password, role } = await request.json();

    // Validate required fields
    if (!name || !username || !email || !password) {
      return NextResponse.json(
        { error: "Naam, gebruikersnaam, e-mail en wachtwoord zijn verplicht" },
        { status: 400 }
      );
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: "Gebruikersnaam moet 3-30 karakters zijn (letters, cijfers, -, _)" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Ongeldig e-mailadres" }, { status: 400 });
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Wachtwoord moet minstens 8 karakters zijn" },
        { status: 400 }
      );
    }

    // Check uniqueness
    const existingEmail = await db.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: "E-mailadres is al in gebruik" }, { status: 409 });
    }
    const existingUsername = await db.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json({ error: "Gebruikersnaam is al in gebruik" }, { status: 409 });
    }

    // Cannot create owner (only one owner)
    const validRole = role === "owner" ? "viewer" : role || "viewer";
    const validRoles = ["admin", "marketer", "content_manager", "sales", "analyst", "viewer"];
    if (!validRoles.includes(validRole) && validRole !== "owner") {
      return NextResponse.json({ error: "Ongeldige rol" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: {
        name,
        username,
        email,
        passwordHash,
        role: validRole,
        createdBy: session.userId,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await logAudit("user_created", session.userId, "user", user.id, {
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({ user: { ...user, createdAt: user.createdAt.toISOString() } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Kan gebruiker niet aanmaken", details: String(error) },
      { status: 500 }
    );
  }
}
