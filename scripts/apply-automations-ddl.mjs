// Applies the automations schema + the two dashboard accounts directly over
// DATABASE_URL.
//
// `prisma db push` hangs against the Supabase transaction pooler, so the DDL is
// issued by hand. Prisma quotes every identifier, so the tables and columns
// below use the exact quoted camelCase names the generated client expects.
// Every statement is idempotent — re-running this is safe.
//
// Usage: node scripts/apply-automations-ddl.mjs

import { readFileSync } from "node:fs";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "RecurringTask" (
     "id" TEXT NOT NULL,
     "title" TEXT NOT NULL,
     "description" TEXT,
     "category" TEXT NOT NULL DEFAULT 'algemeen',
     "priority" TEXT NOT NULL DEFAULT 'normal',
     "deadlineMinutes" INTEGER NOT NULL DEFAULT 1020,
     "timezone" TEXT NOT NULL DEFAULT 'Europe/Brussels',
     "days" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
     "remindBeforeMinutes" INTEGER NOT NULL DEFAULT 30,
     "assigneeId" TEXT,
     "active" BOOLEAN NOT NULL DEFAULT true,
     "lastCompletedDate" TEXT,
     "lastMissedDate" TEXT,
     "lastRemindedDate" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "RecurringTask_active_idx" ON "RecurringTask"("active")`,

  `CREATE TABLE IF NOT EXISTS "UptimeIncident" (
     "id" TEXT NOT NULL,
     "target" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'down',
     "statusCode" INTEGER,
     "errorMsg" TEXT,
     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "endedAt" TIMESTAMP(3),
     "durationSec" INTEGER,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "UptimeIncident_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "UptimeIncident_target_startedAt_idx"
     ON "UptimeIncident"("target", "startedAt")`,

  `CREATE TABLE IF NOT EXISTS "ActivityEvent" (
     "id" TEXT NOT NULL,
     "type" TEXT NOT NULL,
     "title" TEXT,
     "detail" TEXT,
     "meta" TEXT,
     "actorId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ActivityEvent_type_idx" ON "ActivityEvent"("type")`,

  `CREATE TABLE IF NOT EXISTS "TelegramState" (
     "id" TEXT NOT NULL DEFAULT 'main',
     "lastUpdateId" BIGINT NOT NULL DEFAULT 0,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "TelegramState_pkey" PRIMARY KEY ("id")
   )`,

  // Task ↔ recurring link, and the two User columns behind presence + the
  // client-facing Workers section.
  `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "recurringTaskId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Task_recurringTaskId_idx" ON "Task"("recurringTaskId")`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canViewWorkers" BOOLEAN NOT NULL DEFAULT false`,
];

// TLS is governed by the sslmode already present in DATABASE_URL.
const client = new Client({ connectionString: env.DATABASE_URL });

await client.connect();

for (const sql of STATEMENTS) {
  const label = sql.trim().split("\n")[0].slice(0, 60);
  await client.query(sql);
  console.log("ok  ", label);
}

// ── Kerim: full-control working account ──
// Same role as the owner so the dashboard never asks him to switch accounts,
// but a separate login so presence, the audit trail and the Workers view can
// tell him apart from the owner identity.
const kerimHash = await bcrypt.hash("quick155", 12);
const kerim = await client.query(
  `INSERT INTO "User" ("id","name","username","email","passwordHash","role","status","canViewWorkers","createdAt","updatedAt")
   VALUES (gen_random_uuid()::text, 'Kerim', 'Kerim', 'kerim@quicksolutionspro.be', $1, 'owner', 'active', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
   ON CONFLICT ("email") DO UPDATE
     SET "passwordHash" = EXCLUDED."passwordHash",
         "role" = 'owner',
         "status" = 'active',
         "updatedAt" = CURRENT_TIMESTAMP
   RETURNING "id","username","role"`,
  [kerimHash]
);
console.log("user", kerim.rows[0]?.username, kerim.rows[0]?.role);

// ── Azedine: keeps his viewer role everywhere, gets the Workers view ──
const azedine = await client.query(
  `UPDATE "User" SET "canViewWorkers" = true, "updatedAt" = CURRENT_TIMESTAMP
   WHERE "email" = 'azedine@quicksolutionspro.be'
   RETURNING "id","name","email","role","canViewWorkers"`,
  []
);
if (azedine.rows.length === 0) {
  console.log("warning: azedine@quicksolutionspro.be not found — run scripts/seed-review-groups.mjs");
} else {
  console.log("user", azedine.rows[0].name, azedine.rows[0].role, "canViewWorkers:", azedine.rows[0].canViewWorkers);
}

// Seed the two recurring obligations, assigned to Kerim.
const kerimId = kerim.rows[0]?.id;
if (kerimId) {
  const SEEDS = [
    {
      title: "Blogpost plaatsen",
      description: "Nieuwe blogpost online zetten op quicksolutionspro.be",
      category: "blog",
      deadline: 900, // 15:00
      days: [1, 2, 3, 4, 5],
      remind: 60,
    },
    {
      title: "Dashboard controleren",
      description: "Reviews, bestellingen en site-status nakijken",
      category: "algemeen",
      deadline: 600, // 10:00
      days: [1, 2, 3, 4, 5, 6, 7],
      remind: 30,
    },
  ];
  for (const s of SEEDS) {
    const existing = await client.query(
      `SELECT "id" FROM "RecurringTask" WHERE "title" = $1`,
      [s.title]
    );
    if (existing.rows.length) {
      await client.query(
        `UPDATE "RecurringTask" SET "assigneeId" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        [existing.rows[0].id, kerimId]
      );
      console.log("recurring exists:", s.title);
      continue;
    }
    await client.query(
      `INSERT INTO "RecurringTask"
         ("id","title","description","category","priority","deadlineMinutes","timezone","days","remindBeforeMinutes","assigneeId","active","createdAt","updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'normal', $4, 'Europe/Brussels', $5, $6, $7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [s.title, s.description, s.category, s.deadline, s.days, s.remind, kerimId]
    );
    console.log("recurring seeded:", s.title);
  }
}

const check = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('RecurringTask','UptimeIncident','ActivityEvent','TelegramState')
  ORDER BY table_name
`);
console.log("tables:", check.rows.map((r) => r.table_name).join(", "));

await client.end();
