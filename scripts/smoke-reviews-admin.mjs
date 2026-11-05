// Verifies the owner's reviews payload now carries the positive deck.
// Usage: BASE_URL=http://localhost:3100 node scripts/smoke-reviews-admin.mjs

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
const owner = await client.query(`SELECT id, name, role FROM "User" WHERE role = 'owner' LIMIT 1`);
await client.end();
if (!owner.rows[0]) throw new Error("no owner user found");

const token = await new SignJWT({ userId: owner.rows[0].id, role: owner.rows[0].role, time: Date.now() })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(env.DASHBOARD_SESSION_SECRET));

const res = await fetch(`${BASE}/api/reviews/groups`, {
  headers: { cookie: `session=${token}` },
  cache: "no-store",
});
console.log("status", res.status);
const data = await res.json();
console.log("mode:", data.mode, "me:", data.me?.name);
console.log("positive:", Array.isArray(data.positive) ? data.positive.length : "MISSING");
console.log(
  "first positive:",
  JSON.stringify(
    data.positive?.[0]
      ? {
          name: data.positive[0].review.reviewerName,
          stars: data.positive[0].review.starRating,
          hasReply: !!data.positive[0].review.replyText,
          location: data.positive[0].review.locationName?.slice(0, 12),
        }
      : null
  )
);
console.log("tasks on admin payload (should be undefined):", data.tasks === undefined ? "ok" : "unexpected");
