// Throwaway: drives a real Chromium against the local production build and
// clicks the sidebar the way the user does, so we see whatever the browser
// sees (including client-side navigation) rather than a hand-built RSC request.
// Delete after use.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/kerim/AppData/Roaming/npm/node_modules/playwright"
);

const ROOT = "C:/Users/kerim/quicksolutions-dashboard";
const BASE = process.argv[2] || "http://localhost:3115";
const CREDS = {
  login: "owner@quicksolutionspro.be",
  password: "Quicksolutions2024!",
};

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

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];

page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
});

// Log in through the API so the browser gets a real session cookie.
const { password, login } = CREDS;
const res = await page.request.post(`${BASE}/api/auth/login`, {
  data: { login, password },
});
console.log("login:", res.status());

async function visit(route, label) {
  consoleErrors.length = 0;
  pageErrors.length = 0;
  badResponses.length = 0;

  try {
    await page.goto(`${BASE}${route}`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
  } catch (e) {
    console.log(`  !! goto failed: ${e.message.split("\n")[0]}`);
  }
  await page.waitForTimeout(1500);

  const bodyText = (await page.textContent("body")) || "";
  const errMarkers = [
    "Application error",
    "could not be loaded",
    "couldn't load",
    "something went wrong",
    "Internal Server Error",
  ];
  const seen = errMarkers.filter((m) =>
    bodyText.toLowerCase().includes(m.toLowerCase())
  );

  console.log(`\n=== ${label} (${route})`);
  console.log(`  title: ${await page.title()}`);
  console.log(`  error surface on page: ${seen.length ? seen.join(", ") : "none"}`);
  console.log(`  body snippet: ${bodyText.replace(/\s+/g, " ").slice(0, 140)}`);
  if (pageErrors.length)
    console.log(`  PAGE ERRORS:\n    ${pageErrors.join("\n    ")}`);
  if (consoleErrors.length)
    console.log(`  CONSOLE ERRORS:\n    ${consoleErrors.slice(0, 6).join("\n    ")}`);
  if (badResponses.length)
    console.log(`  BAD RESPONSES:\n    ${badResponses.slice(0, 8).join("\n    ")}`);
}

// 1. Land on the dashboard first, then navigate client-side via the sidebar —
//    this is the path that differs from a plain page load.
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
console.log("landed on /dashboard:", await page.title());

// Find the sidebar link to the blog.
const blogLink = page.locator('a[href="/dashboard/blog"]').first();
const count = await blogLink.count();
console.log(`sidebar/blog links found: ${count}`);

if (count > 0) {
  consoleErrors.length = 0;
  pageErrors.length = 0;
  badResponses.length = 0;
  await blogLink.click();
  await page.waitForTimeout(4000);
  const bodyText = (await page.textContent("body")) || "";
  console.log("\n=== CLICK 'Blog' in sidebar (client-side nav)");
  console.log(`  url now: ${page.url()}`);
  console.log(`  title: ${await page.title()}`);
  console.log(`  body snippet: ${bodyText.replace(/\s+/g, " ").slice(0, 200)}`);
  if (pageErrors.length) console.log(`  PAGE ERRORS:\n    ${pageErrors.join("\n    ")}`);
  if (consoleErrors.length)
    console.log(`  CONSOLE ERRORS:\n    ${consoleErrors.slice(0, 6).join("\n    ")}`);
  if (badResponses.length)
    console.log(`  BAD RESPONSES:\n    ${badResponses.join("\n    ")}`);
}

await visit("/dashboard/blog", "blog list (direct)");
await visit("/dashboard/blog/nieuw", "new post (direct)");

// And the sidebar click from the blog list into "Nieuw Artikel".
await page.goto(`${BASE}/dashboard/blog`, { waitUntil: "networkidle" });
const newLink = page.locator('a[href="/dashboard/blog/nieuw"]').first();
if (await newLink.count()) {
  pageErrors.length = 0;
  consoleErrors.length = 0;
  badResponses.length = 0;
  await newLink.click();
  await page.waitForTimeout(3500);
  const t = (await page.textContent("body")) || "";
  console.log("\n=== CLICK 'Nieuw Artikel' (client-side nav)");
  console.log(`  url: ${page.url()}`);
  console.log(`  body snippet: ${t.replace(/\s+/g, " ").slice(0, 200)}`);
  if (pageErrors.length) console.log(`  PAGE ERRORS:\n    ${pageErrors.join("\n    ")}`);
  if (consoleErrors.length)
    console.log(`  CONSOLE ERRORS:\n    ${consoleErrors.slice(0, 6).join("\n    ")}`);
  if (badResponses.length) console.log(`  BAD RESPONSES:\n    ${badResponses.join("\n    ")}`);
}

await browser.close();
process.exit(0);
