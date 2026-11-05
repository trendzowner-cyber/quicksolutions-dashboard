// One-off (idempotent) seed for the role-based review system:
//  1. Creates "ReviewGroup" + "ReviewAssignment" tables (camelCase-quoted,
//     matching Prisma's default naming).
//  2. Adds User."groupId".
//  3. Seeds Team A (active) + Team B.
//  4. Creates the 6 team accounts: Steven, Rob, Nacer (Team A),
//     Azedine, Reza, Elias (Team B) — role viewer, password Quicksolutions2024!
// Run: $env:SUPABASE_TOKEN='sbp_...'; node scripts/seed-review-groups.mjs

import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const PROJECT = "jvprvhfsybcseluehzja";
const API = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.SUPABASE_TOKEN;
if (!TOKEN) {
  console.error("SUPABASE_TOKEN env is required");
  process.exit(1);
}

async function query(sql, label) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${text.slice(0, 600)}`);
  }
  console.log(`✓ ${label}`);
}

const DDL = `
CREATE TABLE IF NOT EXISTS "ReviewGroup" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "leadUserId" TEXT,
  "activeFrom" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewGroup_name_key" ON "ReviewGroup"("name");
CREATE INDEX IF NOT EXISTS "ReviewGroup_sortOrder_idx" ON "ReviewGroup"("sortOrder");

CREATE TABLE IF NOT EXISTS "ReviewAssignment" (
  "id" TEXT PRIMARY KEY,
  "reviewId" TEXT NOT NULL REFERENCES "GoogleReview"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "groupId" TEXT,
  "weekKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'todo',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewAssignment_reviewId_weekKey_key" ON "ReviewAssignment"("reviewId","weekKey");
CREATE INDEX IF NOT EXISTS "ReviewAssignment_userId_weekKey_idx" ON "ReviewAssignment"("userId","weekKey");
CREATE INDEX IF NOT EXISTS "ReviewAssignment_groupId_weekKey_idx" ON "ReviewAssignment"("groupId","weekKey");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
`;

const SEED_GROUPS = `
INSERT INTO "ReviewGroup" ("id","name","sortOrder","leadUserId","activeFrom","createdAt") VALUES
('team-a','Team A',1,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('team-b','Team B',2,NULL,NULL,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
`;

async function main() {
  await query(DDL, "tables + User.groupId");
  await query(SEED_GROUPS, "seed Team A / Team B");

  const hash = bcrypt.hashSync("Quicksolutions2024!", 12);
  const members = [
    { name: "Steven", group: "team-a" },
    { name: "Rob", group: "team-a" },
    { name: "Nacer", group: "team-a" },
    { name: "Azedine", group: "team-b" },
    { name: "Reza", group: "team-b" },
    { name: "Elias", group: "team-b" },
  ];

  const values = members
    .map((m) => {
      const username = m.name.toLowerCase();
      const email = `${username}@quicksolutionspro.be`;
      const id = randomUUID();
      return `('${id}','${m.name}','${username}','${email}','${hash}','viewer','active','${m.group}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
    })
    .join(",\n");

  await query(
    `INSERT INTO "User" ("id","name","username","email","passwordHash","role","status","groupId","createdAt","updatedAt") VALUES\n${values}\nON CONFLICT DO NOTHING;`,
    "create 6 team accounts"
  );

  console.log("\nDone. Accounts: steven/rob/nacer@quicksolutionspro.be (Team A), azedine/reza/elias@quicksolutionspro.be (Team B) — password Quicksolutions2024! for all.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
