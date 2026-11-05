import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export const maxDuration = 30;

// Google creative preview URLs (simgad/tpc.googlesyndication) often refuse
// hotlinking or expire for the browser. This proxy fetches them server-side
// with a browser UA and streams the bytes back, with an allowlist so it can
// never become an open proxy.

const ALLOWED_HOSTS = [
  /^tpc\.googlesyndication\.com$/,
  /^(?:[\w-]+\.)*simgad\.net$/,
  /^simg\d*\.googlesyndication\.com$/,
  /^(?:[\w-]+\.)*ggpht\.com$/,
  /^(?:[\w-]+\.)*googleusercontent\.com$/,
  /^displayads-formats\.googleusercontent\.com$/,
];

export async function GET(request: NextRequest) {
  if (!(await verifySession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url ontbreekt" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Ongeldige url" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.some((re) => re.test(parsed.hostname))) {
    return NextResponse.json({ error: "Host niet toegestaan" }, { status: 403 });
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return NextResponse.json({ error: `Bron gaf ${res.status}` }, { status: 502 });

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      return NextResponse.json({ error: "Geen afbeelding" }, { status: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
