import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const getSecret = () =>
  new TextEncoder().encode(process.env.DASHBOARD_SESSION_SECRET);

export async function createSession(): Promise<string> {
  return new SignJWT({ authenticated: true, time: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
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

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
