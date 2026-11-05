// Smoke test for the blog idea generator + article interlinking.
// Mints a session token in memory for the owner account, calls the real
// endpoints on a local dev server, prints what the model returned.
//
// Usage: node scripts/smoke-blog-ideas.mjs
//   BASE_URL=http://localhost:3100 node scripts/smoke-blog-ideas.mjs

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { SignJWT } from "jose";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const BASE = process.env.BASE_URL || "http://localhost:3100";

const client = new Client({ connectionString: env.DATABASE_URL });
await client.connect();
const owner = await client.query(
  `SELECT id, name, role FROM "User" WHERE role = 'owner' ORDER BY "createdAt" LIMIT 1`
);
await client.end();
if (!owner.rows[0]) throw new Error("no owner user found");
console.log("owner:", owner.rows[0].name, owner.rows[0].id);

const token = await new SignJWT({
  userId: owner.rows[0].id,
  role: owner.rows[0].role,
  time: Date.now(),
})
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(env.DASHBOARD_SESSION_SECRET));

const cookie = `session=${token}`;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json;
}

if (!process.env.SKIP_IDEAS) {
  console.log("\n=== batch 1 ===");
const first = await post("/api/ai/blog-ideas", {});
console.log("focus:", first.focus);
console.log("generated:", first.generated, "skipped:", first.skipped, "targets:", JSON.stringify(first.linkTargets));
for (const idea of (first.ideas || []).slice(0, 4)) {
  console.log(`- [${idea.meta?.contentType ?? "?"}/${idea.meta?.intent ?? "?"}/${idea.meta?.funnel ?? "?"}] ${idea.title}`);
  for (const l of idea.meta?.internalLinks ?? []) console.log(`    link: ${l.anchorText} -> ${l.url}`);
}

console.log("\n=== batch 2 (must differ in focus and titles) ===");
const second = await post("/api/ai/blog-ideas", {});
console.log("focus:", second.focus, "generated:", second.generated, "skipped:", second.skipped);
const firstTitles = new Set((first.ideas || []).map((i) => i.title));
const overlap = (second.ideas || []).filter((i) => firstTitles.has(i.title) && i.meta?.focus === second.focus);
console.log("titles from batch 2:", (second.ideas || []).filter((i) => i.meta?.focus === second.focus).length);
}

console.log("\n=== article generation (interlinking) ===");
const post1 = await post("/api/ai/generate-blog", {
  topic: "Refurbished iPhone 13 kopen in België: waar op letten?",
  keywords: "refurbished iPhone 13, garantie, batterijgezondheid",
});
console.log("title:", post1.title);
console.log("internalLinks:", JSON.stringify(post1.internalLinks, null, 2));
const anchors = [...String(post1.content || "").matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
  href: m[1],
  text: m[2].replace(/<[^>]*>/g, "").slice(0, 60),
}));
console.log("anchors in content:", anchors.length);
for (const a of anchors) console.log(`  ${a.text} -> ${a.href}`);
console.log("leftover placeholders:", (String(post1.content || "").match(/\[LINK:/g) || []).length);
console.log("word count:", String(post1.content || "").replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length);
