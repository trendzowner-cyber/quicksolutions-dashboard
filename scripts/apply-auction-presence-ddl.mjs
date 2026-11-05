// Creates the AuctionPresence table (see prisma/schema.prisma).
// Additive only — safe to re-run.
//
// Usage: node scripts/apply-auction-presence-ddl.mjs

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
  CREATE TABLE IF NOT EXISTS "AuctionPresence" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL,
    "seenOn" DATE NOT NULL,
    "apiVersion" TEXT NOT NULL DEFAULT 'v23',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuctionPresence_pkey" PRIMARY KEY ("id")
  )
`);
await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AuctionPresence_campaignId_domain_seenOn_key" ON "AuctionPresence"("campaignId", "domain", "seenOn")`);
await client.query(`CREATE INDEX IF NOT EXISTS "AuctionPresence_domain_seenOn_idx" ON "AuctionPresence"("domain", "seenOn")`);
await client.query(`CREATE INDEX IF NOT EXISTS "AuctionPresence_seenOn_idx" ON "AuctionPresence"("seenOn")`);

console.log("AuctionPresence tabel klaar");
await client.end();
