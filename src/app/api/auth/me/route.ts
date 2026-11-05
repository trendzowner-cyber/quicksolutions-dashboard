import { NextResponse } from "next/server";
import { getSessionUser, getUserById } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = await getUserById(session.userId);
    if (!user || user.status !== "active") {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        // Drives the Workers entry in the nav — the section only exists for the
        // client account that was explicitly granted it.
        canViewWorkers: user.canViewWorkers || user.role === "owner",
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
