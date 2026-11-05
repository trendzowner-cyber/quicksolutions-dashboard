import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";

const SALT_ROUNDS = 12;

const getSecret = () =>
  new TextEncoder().encode(process.env.DASHBOARD_SESSION_SECRET);

// ─── Password hashing ───

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Session management ───

export async function createSession(userId: string, role: string): Promise<string> {
  return new SignJWT({ userId, role, time: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    // Everyone gets a long session: staff work the review deck from their
    // phones like an app, and a daily login is exactly what makes an installed
    // app feel like a website. Middleware renews it (sliding 90d, see
    // src/middleware.ts) and the dashboard layout re-checks that the account is
    // still active on every page load, so disabling a user takes effect on
    // their next request instead of when their cookie happens to expire.
    .setExpirationTime("90d")
    .sign(getSecret());
}

export async function verifySession(token?: string): Promise<boolean> {
  try {
    if (!token) {
      const cookieStore = await cookies();
      token = cookieStore.get("session")?.value;
    }
    if (!token) return false;
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function getSessionUser(): Promise<{
  userId: string;
  role: string;
} | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId as string,
      role: (payload.role as string) || "viewer",
    };
  } catch {
    return null;
  }
}

export async function getSessionRole(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return (payload.role as string) || null;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ─── Authorization helpers ───

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  admin: 80,
  marketer: 60,
  content_manager: 50,
  sales: 40,
  analyst: 30,
  viewer: 10,
};

export function hasRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}

// ─── Permission checks ───

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["*"],
  admin: [
    "users.view", "users.create", "users.edit", "users.disable",
    "settings.view", "settings.manage",
    "integrations.manage",
    "audit.view",
    "tasks.view", "tasks.create", "tasks.edit", "tasks.delete", "tasks.assign",
    "content.view", "content.create", "content.edit", "content.publish", "content.delete",
    "marketing.view", "marketing.manage",
    "coupons.create", "coupons.edit",
    "orders.view", "orders.manage",
    "products.view", "products.manage",
    "customers.view",
    "analytics.view", "analytics.export",
    "dashboard.view",
    "sales.view",
  ],
  marketer: [
    "dashboard.view", "analytics.view", "analytics.export",
    "marketing.view", "marketing.manage",
    "coupons.create", "coupons.edit",
    "content.view", "content.create", "content.edit",
    "tasks.view", "tasks.create", "tasks.edit",
    "orders.view", "products.view", "customers.view",
    "sales.view",
  ],
  content_manager: [
    "dashboard.view", "analytics.view",
    "content.view", "content.create", "content.edit", "content.publish",
    "tasks.view", "tasks.create", "tasks.edit",
    "products.view",
  ],
  sales: [
    "dashboard.view", "analytics.view",
    "sales.view", "orders.view", "orders.manage",
    "products.view", "customers.view",
    "tasks.view",
  ],
  analyst: [
    "dashboard.view", "analytics.view", "analytics.export",
    "sales.view", "orders.view", "products.view",
  ],
  viewer: ["dashboard.view"],
};

export function hasPermission(userRole: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[userRole];
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

// ─── User CRUD helpers ───

export async function getUserById(id: string) {
  return db.user.findUnique({ where: { id } });
}

export async function getUserByEmail(email: string) {
  return db.user.findUnique({ where: { email } });
}

export async function getUserByUsername(username: string) {
  return db.user.findUnique({ where: { username } });
}
