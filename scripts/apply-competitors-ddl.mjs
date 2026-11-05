// Creates the Competitor + CompetitorAd tables (see prisma/schema.prisma).
// Additive only — safe to re-run.
//
// Usage: node scripts/apply-competitors-ddl.mjs

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

await client.query(`
  CREATE TABLE IF NOT EXISTS "Competitor" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "advertiserId" TEXT,
    "name" TEXT,
    "adCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
  )
`);
await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "Competitor_domain_key" ON "Competitor"("domain")`);

await client.query(`
  CREATE TABLE IF NOT EXISTS "CompetitorAd" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "advertiser" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'unknown',
    "previewUrl" TEXT,
    "link" TEXT NOT NULL DEFAULT '',
    "firstShown" DATE,
    "lastShown" DATE,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CompetitorAd_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompetitorAd_competitorId_fkey" FOREIGN KEY ("competitorId")
      REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )
`);
await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorAd_competitorId_creativeId_key" ON "CompetitorAd"("competitorId", "creativeId")`);
await client.query(`CREATE INDEX IF NOT EXISTS "CompetitorAd_competitorId_lastShown_idx" ON "CompetitorAd"("competitorId", "lastShown")`);

console.log("Competitor-tabellen klaar");
await client.end();
