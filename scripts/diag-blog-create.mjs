// Throwaway: performs the actual blog-creation flow in a real browser —
// topic -> "Genereer met AI" -> wait -> inspect. The app has no error.tsx
// anywhere, so any throw in a client component lands on Next's global error
// page ("This page couldn't load"); this pins down where it comes from.
//
// Credentials come from the environment (QS_LOGIN / QS_PASSWORD) so nothing
// secret is written into the repo. Delete this file when done.
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/kerim/AppData/Roaming/npm/node_modules/playwright"
);

const BASE = process.argv[2] || "https://quicksolutions-dashboard.vercel.app";

// Credentials are read from the project's memory note at runtime rather than
// passed on a command line or written here, so nothing secret is echoed or
// committed. The note records them as `email` / `password`.
function credentials() {
  if (process.env.QS_LOGIN && process.env.QS_PASSWORD) {
    return { login: process.env.QS_LOGIN, password: process.env.QS_PASSWORD };
  }
  const note =
    "C:/Users/kerim/.claude/projects/C--WINDOWS-system32/memory/quicksolutions-dashboard.md";
  const text = fs.readFileSync(note, "utf8");
  const m = text.match(/`([^`\s]+@[^`\s]+)`\s*\/\s*`([^`]+)`/);
  if (!m) throw new Error("could not read credentials from the memory note");
  return { login: m[1], password: m[2] };
}

const { login, password } = credentials();

const browser = await chromium.launch();
const page = await browser.newPage();

const pageErrors = [];
const consoleErrors = [];
const badResponses = [];
const apiCalls = [];

page.on("pageerror", (e) => pageErrors.push(e.stack || e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/")) {
    apiCalls.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, "")}`);
  }
  if (r.status() >= 400) badResponses.push(`${r.status()} ${u.replace(BASE, "")}`);
});

const auth = await page.request.post(`${BASE}/api/auth/login`, {
  data: { login, password },
});
console.log("login:", auth.status());

function report(tag) {
  if (pageErrors.length) {
    console.log(`  [${tag}] PAGE ERRORS:`);
    for (const e of pageErrors.slice(0, 4))
      console.log("      " + e.split("\n").slice(0, 8).join("\n      "));
  }
  if (consoleErrors.length)
    console.log(`  [${tag}] CONSOLE: ${consoleErrors.slice(0, 5).join(" | ")}`);
  if (badResponses.length)
    console.log(`  [${tag}] BAD: ${badResponses.join(" | ")}`);
}

console.log("\n=== STEP 1: open /dashboard/blog/nieuw");
await page.goto(`${BASE}/dashboard/blog/nieuw`, {
  waitUntil: "networkidle",
  timeout: 60000,
});
console.log("  url:", page.url());
report("open");

console.log("\n=== STEP 2: type a topic");
const topic = page.locator("#topic");
await topic.waitFor({ timeout: 15000 });
await topic.fill("Refurbished iPhone kopen in Belgie");
console.log("  value:", await topic.inputValue());

console.log("\n=== STEP 3: click Genereer met AI (long-running)");
pageErrors.length = 0;
consoleErrors.length = 0;
badResponses.length = 0;
apiCalls.length = 0;

const genBtn = page.getByRole("button", { name: /Genereer met AI/i });
console.log("  generate button count:", await genBtn.count());
await genBtn.first().click();

for (let i = 1; i <= 12; i++) {
  await page.waitForTimeout(5000);
  const body = ((await page.textContent("body")) || "").replace(/\s+/g, " ");
  const crashed = /This page couldn/i.test(body);
  const hasEditor = (await page.locator("#title").count()) > 0;
  console.log(
    `  t=${i * 5}s crashed=${crashed} editor=${hasEditor} api=[${apiCalls.join(" , ") || "none"}]`
  );
  if (crashed) {
    console.log("  !!! GLOBAL ERROR PAGE REACHED");
    console.log("  body:", body.slice(0, 400));
    break;
  }
  if (hasEditor) {
    console.log("  -> editor rendered, generation completed");
    break;
  }
}

console.log("\n=== AFTER GENERATE");
report("post-gen");
console.log("  final url:", page.url());
