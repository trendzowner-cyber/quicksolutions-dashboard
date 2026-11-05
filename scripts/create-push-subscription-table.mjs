// One-off: create the PushSubscription table when `prisma db push` hangs on
// the Supabase transaction pooler (prepared-statement issue). Plain pg with
// the simple query protocol works fine through the pooler.
//
// Run: node scripts/create-push-subscription-table.mjs

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const client = new pg.Client({
  // Same as the app's PrismaPg adapter in src/lib/db.ts: plain pooler
  // connection, no ssl override.
  connectionString: process.env.DATABASE_URL,
});

const DDL = `
CREATE TABLE IF NOT EXISTS "public"."PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastNotifiedAt" TIMESTAMP(3),
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "public"."PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "public"."PushSubscription"("userId");
ALTER TABLE "public"."PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

try {
  await client.connect();
  await client.query(DDL);
  console.log("PushSubscription table ready");
} catch (error) {
  console.error("Failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
