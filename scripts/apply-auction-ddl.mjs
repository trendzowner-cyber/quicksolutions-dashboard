// Creates the AuctionSnapshot table (see prisma/schema.prisma for the model
// and the rationale). Additive only — safe to re-run.
//
// Usage: node scripts/apply-auction-ddl.mjs

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
  CREATE TABLE IF NOT EXISTS "AuctionSnapshot" (
    "id" TEXT NOT NULL,
    "pulledOn" DATE NOT NULL,
    "campaignId" TEXT NOT NULL DEFAULT 'account',
    "domain" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'csv',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuctionSnapshot_pkey" PRIMARY KEY ("id")
  )
`);
await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AuctionSnapshot_pulledOn_campaignId_domain_key" ON "AuctionSnapshot"("pulledOn", "campaignId", "domain")`);
await client.query(`CREATE INDEX IF NOT EXISTS "AuctionSnapshot_domain_idx" ON "AuctionSnapshot"("domain")`);
await client.query(`CREATE INDEX IF NOT EXISTS "AuctionSnapshot_pulledOn_idx" ON "AuctionSnapshot"("pulledOn")`);

console.log("AuctionSnapshot tabel klaar");
await client.end();
