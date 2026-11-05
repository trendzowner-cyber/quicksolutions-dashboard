// Self-service password change.
//
// Previously the only way to change a password was editing DASHBOARD_PASSWORD in
// Vercel and redeploying, which also only ever affected the env-fallback login —
// real DB users had no way to change theirs at all.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, verifyPassword, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const MIN_LENGTH = 10;

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { currentPassword, newPassword } = await request.json();

    if (typeof newPassword !== "string" || newPassword.length < MIN_LENGTH) {
      return NextResponse.json(
        { error: `Nieuw wachtwoord moet minstens ${MIN_LENGTH} tekens zijn` },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "Geen wachtwoord ingesteld voor dit account" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(String(currentPassword ?? ""), user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Huidig wachtwoord is onjuist" },
        { status: 400 }
      );
    }

    if (await verifyPassword(newPassword, user.passwordHash)) {
      return NextResponse.json(
        { error: "Nieuw wachtwoord is identiek aan het huidige" },
        { status: 400 }
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    await logAudit("password_changed", user.id, "user", user.id, {
      source: "instellingen",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onbekende fout" },
      { status: 500 }
    );
  }
}
