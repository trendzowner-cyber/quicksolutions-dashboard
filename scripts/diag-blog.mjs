// Throwaway diagnostic. Starts the built app locally, mints a session cookie
// from the same secret the middleware verifies, and replays the exact RSC
// request the browser makes on client-side navigation. The server's own stderr
// is what we are after: in production Next redacts the error, locally it does
// not. Delete after use.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const ROOT = "C:/Users/kerim/quicksolutions-dashboard";
process.chdir(ROOT);

// Minimal .env reader — the app's own loader is not available outside Next.
function readEnv() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return env;
}

async function main() {
  const env = readEnv();
  const secret = env.DASHBOARD_SESSION_SECRET;
  if (!secret) throw new Error("no DASHBOARD_SESSION_SECRET found");

  const { SignJWT } = require(path.join(ROOT, "node_modules/jose"));
  const token = await new SignJWT({
    userId: "9fd7055d-6cc1-43d1-b095-f45d9dbf4e53",
    role: "owner",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));

  const logPath = path.join(process.env.TEMP, "qsrv3.log");
  const out = fs.openSync(logPath, "w");
  const server = spawn("npx", ["next", "start", "-p", "3114"], {
    shell: true,
    stdio: ["ignore", out, out],
    detached: false,
  });

  await new Promise((r) => setTimeout(r, 6000));

  const targets = [
    ["/dashboard/blog", "blog list"],
    ["/dashboard/blog/nieuw", "new post"],
    ["/dashboard/taken", "tasks (control)"],
  ];

  for (const [route, label] of targets) {
    const stateTree =
      "%5B%22%22%2C%7B%22children%22%3A%5B%22dashboard%22%2C%7B%22children%22%3A%5B%22blog%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D";
    for (const [mode, headers] of [
      ["full load", { Cookie: `session=${token}` }],
      ["client nav (RSC)", { Cookie: `session=${token}`, RSC: "1" }],
      [
        "RSC + state tree",
        {
          Cookie: `session=${token}`,
          RSC: "1",
          "Next-Router-State-Tree": stateTree,
        },
      ],
    ]) {
      const res = await fetch(`http://localhost:3114${route}?_rsc=diag1`, {
        headers,
        redirect: "manual",
      });
      console.log(
        `${String(res.status).padEnd(4)} ${label.padEnd(18)} ${mode}`
      );
    }
  }

  await new Promise((r) => setTimeout(r, 1500));
  console.log("\n===== SERVER LOG =====");
  const raw = fs.readFileSync(logPath, "utf8");
  // Strip ANSI colour codes so the error text is readable.
  console.log(raw.replace(/\[[0-9;]*m/g, ""));

  try {
    server.kill();
  } catch {}
  process.exit(0);
}

main().catch((e) => {
  console.error("DIAG FAILED:", e.message);
  process.exit(1);
});
