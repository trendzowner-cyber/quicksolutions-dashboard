// Adds RecurringTask.lateUntilMinutes and applies the working-day cut-off to
// the blogpost rule.
//
// `prisma db push` hangs against the Supabase transaction pooler, so the DDL is
// issued by hand. Prisma quotes every identifier, so the column name below is
// the exact quoted camelCase name the generated client expects. Idempotent.
//
// Usage: node scripts/apply-late-until-ddl.mjs

import { readFileSync } from "node:fs";
import { Client } from "pg";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const client = new Client({ connectionString: env.DATABASE_URL });
await client.connect();

// 1080 = 18:00 Brussels — Kerim's end of working day.
const END_OF_DAY = 1080;

await client.query(
  `ALTER TABLE "RecurringTask" ADD COLUMN IF NOT EXISTS "lateUntilMinutes" INTEGER`
);
console.log("column lateUntilMinutes: ok");

// The blogpost is aimed at 15:00 but the working day runs to 18:00, so a late
// post still counts. Only touch rules that have no cut-off yet, so re-running
// never overwrites a deliberate edit.
const blog = await client.query(
  `UPDATE "RecurringTask"
      SET "lateUntilMinutes" = $1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "lateUntilMinutes" IS NULL
      AND (LOWER("title") LIKE '%blog%' OR "category" = 'blog')
      AND "deadlineMinutes" < $1
    RETURNING "id", "title", "deadlineMinutes"`,
  [END_OF_DAY]
);
for (const row of blog.rows) {
  console.log(`cut-off 18:00 set for: ${row.title} (deadline ${row.deadlineMinutes})`);
}

const all = await client.query(
  `SELECT "title", "deadlineMinutes", "lateUntilMinutes", "active"
     FROM "RecurringTask" ORDER BY "createdAt"`
);
for (const r of all.rows) {
  console.log(
    `  ${r.active ? "on " : "off"}  ${
      String(Math.floor(r.deadlineMinutes / 60)).padStart(2, "0") +
      ":" +
      String(r.deadlineMinutes % 60).padStart(2, "0")
    }  ${
      r.lateUntilMinutes == null
        ? "hard   "
        : "tot " +
          String(Math.floor(r.lateUntilMinutes / 60)).padStart(2, "0") +
          ":" +
          String(r.lateUntilMinutes % 60).padStart(2, "0")
    }  ${r.title}`
  );
}

await client.end();
