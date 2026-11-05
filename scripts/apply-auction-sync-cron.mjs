// Registers the daily auction-presence sync as a pg_cron job.
// Usage: node scripts/apply-auction-sync-cron.mjs

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

const BASE = "https://quicksolutions-dashboard.vercel.app";
const SECRET = `(select value from public.cron_secrets where key = 'x-sync-secret')`;

const client = new Client({ connectionString: env.DATABASE_URL });
await client.connect();

// Daily at 07:41 UTC — after the ads digest (06:30), monitor (06:45) and
// competitor-ad sync (07:17), off the top/half-hour congestion.
await client.query(`select cron.schedule($1, $2, $3)`, [
  "qs-auction-sync",
  "41 7 * * *",
  `select net.http_post(
    url := '${BASE}/api/ads/auction/sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Sync-Secret', ${SECRET}),
    timeout_milliseconds := 30000
  )`,
]);

const check = await client.query(
  `select jobname, schedule, active from cron.job where jobname = 'qs-auction-sync'`
);
console.log("geregistreerd:", check.rows[0] ?? "NIET GEVONDEN");

await client.end();
