// Adds BlogIdea.meta (JSONB) — the enriched SEO plan per idea (slug, intent,
// content type, internal-link targets, FAQ).
//
// `prisma db push` hangs against the Supabase transaction pooler, so the DDL is
// issued by hand. Prisma quotes every identifier, so the column name below is
// the exact quoted name the generated client expects. Idempotent.
//
// Usage: node scripts/apply-blogidea-meta-ddl.mjs

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

await client.query(`ALTER TABLE "BlogIdea" ADD COLUMN IF NOT EXISTS "meta" JSONB`);
console.log("column BlogIdea.meta: ok");

const cols = await client.query(
  `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'BlogIdea' ORDER BY ordinal_position`
);
for (const c of cols.rows) console.log(`  ${c.column_name} ${c.data_type}`);

const count = await client.query(`SELECT COUNT(*)::int AS n FROM "BlogIdea"`);
console.log("existing ideas:", count.rows[0].n);

await client.end();
