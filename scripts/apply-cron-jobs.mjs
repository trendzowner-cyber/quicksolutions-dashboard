// Registers the pg_cron jobs that drive the automations.
//
// The shared secret is extracted server-side from the existing qs-reviews-sync
// job into public.cron_secrets, and every new job references it as a subquery.
// The value therefore never appears in this file, in a log, or in tool output —
// and rotating it means updating one row, not four job definitions.
//
// Usage: node scripts/apply-cron-jobs.mjs

import { readFileSync } from "node:fs";
import { Client } from "pg";

const BASE = "https://quicksolutions-dashboard.vercel.app";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const SECRET = `(select value from public.cron_secrets where key = 'x-sync-secret')`;

/** net.http_post with the secret header. pg_net's default timeout is 2000 ms,
 *  which a cold Vercel start blows through — failures then only show up in
 *  net._http_response, never in the cron log. */
function post(path, { body, timeout }) {
  return `select net.http_post(
    url := '${BASE}${path}',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Sync-Secret', ${SECRET}),
    ${body ? `body := ${body},` : ""}
    timeout_milliseconds := ${timeout}
  )`;
}

const JOBS = [
  {
    name: "qs-uptime-notify",
    schedule: "* * * * *",
    // Fires every minute, 25 s after the tick so the tick's rows are committed.
    // Compares the two most recent samples per target and posts only a change.
    command: `select pg_sleep(25);
with latest as (
  select target, status_code, checked_at,
         row_number() over (partition by target order by checked_at desc) as rn
  from monitoring.uptime_checks
  where checked_at > now() - interval '10 minutes'
),
pair as (
  select target,
         bool_or(case when rn = 1 then (status_code is null or status_code >= 500) end) as down_now,
         bool_or(case when rn = 2 then (status_code is null or status_code >= 500) end) as down_prev,
         count(*) filter (where rn = 1) as n1,
         count(*) filter (where rn = 2) as n2,
         max(case when rn = 1 then status_code end) as status_code
  from latest where rn <= 2 group by target
)
${post("/api/notify/uptime", {
      body: `jsonb_build_object('target', pair.target, 'status', case when pair.down_now then 'down' else 'up' end, 'statusCode', pair.status_code)`,
      timeout: 10000,
    })}
from pair
where n1 = 1 and n2 = 1 and down_now is distinct from down_prev`,
  },
  {
    name: "qs-task-sweep",
    schedule: "*/10 * * * *",
    command: post("/api/tasks/sweep", { timeout: 10000 }),
  },
  {
    name: "qs-morning-briefing",
    // 06:00 UTC = 08:00 Brussels in summer, 07:00 in winter. Fixed UTC on
    // purpose: a drifting briefing beats one that silently skips a day.
    schedule: "0 6 * * *",
    command: post("/api/tasks/briefing", { timeout: 10000 }),
  },
  {
    name: "qs-ads-digest",
    schedule: "30 6 * * *",
    command: post("/api/ads/digest", { timeout: 60000 }),
  },
];

const client = new Client({ connectionString: env.DATABASE_URL });
await client.connect();

// ── 1. Extract the shared secret, server-side ──
await client.query(`
  create table if not exists public.cron_secrets (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default now()
  )`);

// Dollar-quoted so the single quotes need no escaping; the backslashes are
// doubled because this sits inside a JS template literal.
const SECRET_RE = String.raw`$re$'X-Sync-Secret'\s*,\s*'([^']+)'$re$`;

const extracted = await client.query(`
  insert into public.cron_secrets (key, value, updated_at)
  select 'x-sync-secret', (regexp_match(command, ${SECRET_RE}))[1], now()
  from cron.job
  where jobname = 'qs-reviews-sync'
    and (regexp_match(command, ${SECRET_RE}))[1] is not null
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning key`);

if (extracted.rowCount === 0) {
  const existing = await client.query(`select 1 from public.cron_secrets where key = 'x-sync-secret'`);
  if (existing.rowCount === 0) {
    console.error("FOUT: secret kon niet uit qs-reviews-sync gehaald worden.");
    console.error("Vul het handmatig in: insert into public.cron_secrets (key, value) values ('x-sync-secret', '<REVIEWS_SYNC_SECRET>');");
    await client.end();
    process.exit(1);
  }
  console.log("secret: al aanwezig in cron_secrets (niet overschreven)");
} else {
  console.log("secret: geextraheerd uit qs-reviews-sync → public.cron_secrets");
}

// ── 2. Register the jobs (cron.schedule upserts by name) ──
for (const job of JOBS) {
  await client.query(`select cron.schedule($1, $2, $3)`, [
    job.name,
    job.schedule,
    job.command,
  ]);
  console.log(`job geregistreerd: ${job.name} (${job.schedule})`);
}

const all = await client.query(
  `select jobname, schedule, active from cron.job order by jobname`
);
console.log("\nalle jobs:");
for (const r of all.rows) {
  console.log(`  ${r.jobname.padEnd(22)} ${r.schedule.padEnd(14)} ${r.active ? "actief" : "UIT"}`);
}

// ── 3. Sanity check: the secret subquery must resolve inside a job body ──
const probe = await client.query(
  `select length(value) as len from public.cron_secrets where key = 'x-sync-secret'`
);
console.log("\nsecret lengte:", probe.rows[0]?.len ?? "ONTBREEKT");

await client.end();
