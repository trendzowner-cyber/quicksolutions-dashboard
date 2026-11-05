// Registers the daily Ads Autopilot anomaly monitor as a pg_cron job.
// Same pattern as apply-cron-jobs.mjs: the shared secret is referenced as a
// subquery into public.cron_secrets, so it never appears in this file.
//
// Usage: node scripts/apply-ads-monitor-cron.mjs

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

// Daily at 06:45 UTC — 15 min after the ads digest, so both read the same
// fresh day-close numbers.
await client.query(`select cron.schedule($1, $2, $3)`, [
  "qs-ads-monitor",
  "45 6 * * *",
  `select net.http_post(
    url := '${BASE}/api/ads/autopilot/monitor',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Sync-Secret', ${SECRET}),
    timeout_milliseconds := 30000
  )`,
]);

const check = await client.query(
  `select jobname, schedule, active from cron.job where jobname = 'qs-ads-monitor'`
);
console.log("geregistreerd:", check.rows[0] ?? "NIET GEVONDEN");

await client.end();
