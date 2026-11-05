import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// GET — Get single user
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "users.view")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, username: true, email: true,
        role: true, status: true, avatarUrl: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Gebruiker niet gevonden" }, { status: 404 });
    }

    return NextResponse.json({
      ...user,
      lastLoginAt: user.lastLoginAt?.toISOString() || null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Kan gebruiker niet laden", details: String(error) },
      { status: 500 }
    );
  }
}

// PUT — Update user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "users.edit")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Gebruiker niet gevonden" }, { status: 404 });
    }

    // Cannot modify owner unless you're the owner
    if (existing.role === "owner" && session.userId !== id) {
      return NextResponse.json({ error: "Je kunt de Owner niet bewerken" }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl;

    // Role changes require admin+
    if (body.role !== undefined && body.role !== existing.role) {
      if (!hasPermission(session.role, "users.edit")) {
        return NextResponse.json({ error: "Geen toegang om rol te wijzigen" }, { status: 403 });
      }
      // Cannot change owner's role
      if (existing.role === "owner") {
        return NextResponse.json({ error: "Owner rol kan niet gewijzigd worden" }, { status: 403 });
      }
      updates.role = body.role;
    }

    // Status changes
    if (body.status !== undefined) {
      if (!hasPermission(session.role, "users.disable")) {
        return NextResponse.json({ error: "Geen toegang om status te wijzigen" }, { status: 403 });
      }
      if (existing.role === "owner") {
        return NextResponse.json({ error: "Owner kan niet uitgeschakeld worden" }, { status: 403 });
      }
      updates.status = body.status;
    }

    // Password change
    if (body.password !== undefined) {
      if (body.password.length < 8) {
        return NextResponse.json(
          { error: "Wachtwoord moet minstens 8 karakters zijn" },
          { status: 400 }
        );
      }
      updates.passwordHash = await hashPassword(body.password);
    }

    const user = await db.user.update({
      where: { id },
      data: updates,
      select: {
        id: true, name: true, username: true, email: true,
        role: true, status: true, lastLoginAt: true, updatedAt: true,
      },
    });

    await logAudit("user_updated", session.userId, "user", id, {
      changes: Object.keys(updates).filter(k => k !== "passwordHash"),
    });

    return NextResponse.json({
      ...user,
      lastLoginAt: user.lastLoginAt?.toISOString() || null,
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Kan gebruiker niet bijwerken", details: String(error) },
      { status: 500 }
    );
  }
}
