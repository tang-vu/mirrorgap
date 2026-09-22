#!/usr/bin/env node
/**
 * e2e-smoke — repeatable browser check of the critical demo flow.
 * Boots a seeded fixture server, drives the SPA with headless Chrome
 * (puppeteer-core + system Chrome — no bundled download), and asserts:
 *
 *   · every view mounts without console errors
 *   · overview/radar/events/asset detail render seeded data
 *   · incident timeline replay advances frames
 *   · Evidence Capsule verifies, and a tampered receipt fails loudly
 *
 * Requires a Chrome/Edge binary: PUPPETEER_EXECUTABLE_PATH, or a standard
 * install location. Skips (exit 0) with a notice when none is found so CI
 * without a browser still passes.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Spawn the server directly (not via pnpm) so child.kill() reaches the actual
// node process — on Windows a pnpm/cmd wrapper leaves the server orphaned.
const WEB_DIR = fileURLToPath(new URL("../apps/web", import.meta.url));

const PORT = Number(process.env.MIRRORGAP_E2E_PORT ?? 8793);
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

const results = [];
const check = (name, ok, detail = "") => {
  results.push([name, ok]);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
};

let puppeteer;
console.log("e2e-smoke: loading browser driver");
try {
  puppeteer = (await import("puppeteer-core")).default;
} catch {
  puppeteer = null;
}

if (!puppeteer || !executablePath) {
  console.log(
    `e2e-smoke: skipped — ${!puppeteer ? "puppeteer-core not installed" : "no Chrome/Edge binary found"} (set PUPPETEER_EXECUTABLE_PATH)`,
  );
  process.exit(0);
}

let child;
let browser;
let page;
const screenshotDir = new URL("../data/e2e/", import.meta.url);
mkdirSync(screenshotDir, { recursive: true });
console.log("e2e-smoke: starting isolated fixture server");
try {
  child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      MIRRORGAP_DATA_MODE: "fixture",
      MIRRORGAP_DB_PATH: ":memory:",
      MIRRORGAP_FIXTURE_SCENARIO: "incident_cycle",
      MIRRORGAP_SEED_TICKS: "31",
      MIRRORGAP_CONFIRM_SCANS: "1",
      MIRRORGAP_NO_LOOP: "1",
    },
    cwd: WEB_DIR,
    stdio: "pipe",
  });
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await sleep(1000);
    try {
      ready = (await fetch(base + "/api/v1/healthz")).ok;
    } catch {}
  }
  if (!ready) throw new Error("server did not start in 90s");
  check("fixture server boots + seeds", true);

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
  });
  page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1440, height: 900 });
  const consoleErrors = [];
  const pendingRequests = new Set();
  page.on("request", (r) => pendingRequests.add(r.url()));
  page.on("requestfinished", (r) => pendingRequests.delete(r.url()));
  page.on("requestfailed", (r) => pendingRequests.delete(r.url()));
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // Navigate then wait for a view-specific element — waiting only for
  // "not loading" races the previous view's stale content.
  const goto = async (hash, sel) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForSelector(sel, { timeout: 15_000 });
    await sleep(150);
  };
  const text = (sel) => page.$eval(sel, (el) => el.textContent ?? "");
  const cards = () => page.$$eval("#view .card", (els) => els.length);

  try {
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  } catch (err) {
    console.log("Pending local requests:", [...pendingRequests].filter((u) => u.startsWith(base)).join(", "));
    console.log(
      "Browser state:",
      await page
        .evaluate(() => ({
          readyState: document.readyState,
          resources: performance.getEntriesByType("resource").map((r) => r.name),
        }))
        .catch(() => "unavailable"),
    );
    throw err;
  }
  await page.waitForSelector(".divergence-map", { timeout: 15_000 });
  check("overview mounts", (await cards()) > 0);
  // badge is populated by the view's data fetch — wait for it to resolve
  await page.waitForFunction(() => (document.querySelector("#mode-badge")?.textContent ?? "…") !== "…", {
    timeout: 10_000,
  });
  check("fixture banner visible", (await text("#fixture-banner")).trim().length > 0);
  check("mode badge = fixture", /fixture/i.test(await text("#mode-badge")));

  await page.screenshot({
    path: fileURLToPath(new URL("overview-desktop.png", screenshotDir)),
    fullPage: true,
  });
  await page.setViewport({ width: 390, height: 844 });
  check(
    "mobile overview has no page overflow",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.screenshot({
    path: fileURLToPath(new URL("overview-mobile.png", screenshotDir)),
    fullPage: true,
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.keyboard.press("/");
  check(
    "keyboard shortcut focuses asset search",
    await page.$eval("#search", (el) => el === document.activeElement),
  );
  await page.keyboard.press("Escape");
  await goto("#/radar", "#radar-chart");
  check("radar renders assets", /NVDA|TSLA|GOLD/i.test(await text("#view")));

  await page.type("#radar-filter", "NVDA");
  check(
    "radar filter narrows the register",
    await page.$$eval(
      "#asset-table tbody tr",
      (rows) => rows.length > 0 && rows.every((r) => r.textContent.includes("NVDA")),
    ),
  );
  await page.$eval("#radar-filter", (el) => {
    el.value = "no-such-asset";
    el.dispatchEvent(new Event("input"));
  });
  check("radar has an honest empty state", /No matching assets/.test(await text("#asset-table")));
  await page.$eval("#radar-filter", (el) => {
    el.value = "";
    el.dispatchEvent(new Event("input"));
  });
  await page.select("#radar-sort", "symbol");
  check(
    "radar alphabetical sort",
    await page.$$eval("#asset-table .asset-link", (links) => {
      const values = links.map((a) => a.firstChild.textContent.trim());
      return values.join() === [...values].sort((a, b) => a.localeCompare(b)).join();
    }),
  );
  await page.screenshot({ path: fileURLToPath(new URL("radar-desktop.png", screenshotDir)), fullPage: true });
  await goto("#/asset/2", "#underlying-compare");
  check("workbench renders peer evidence", /Other-wrapper median/.test(await text("#workbench")));
  await page.screenshot({
    path: fileURLToPath(new URL("workbench-desktop.png", screenshotDir)),
    fullPage: true,
  });

  await page.setViewport({ width: 390, height: 844 });
  check(
    "mobile investigation has no page overflow",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.screenshot({
    path: fileURLToPath(new URL("workbench-mobile.png", screenshotDir)),
    fullPage: true,
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.click("#jump-workbench");
  check(
    "investigation shortcut focuses evidence",
    await page.$eval("#workbench", (el) => el === document.activeElement),
  );
  await page.click("#workbench summary");
  await page.evaluate(() => {
    const form = document.querySelector("#underlying-compare");
    const fields = {
      price: "100",
      currency: "USD",
      unit: "share",
      observedAt: new Date().toISOString(),
      source: "Browser test synthetic input",
      sourceUrl: "https://example.com/quote",
      dataMode: "live",
    };
    for (const [name, value] of Object.entries(fields)) form.elements.namedItem(name).value = value;
    form.querySelectorAll('[name^="units-"]').forEach((e) => {
      e.value = "1";
    });
    form.requestSubmit();
  });
  await page.waitForFunction(() =>
    document.querySelector("#underlying-result")?.textContent.includes("data_mode_mismatch"),
  );
  check(
    "workbench rejects live quote against fixture evidence",
    /blocked/.test(await text("#underlying-result")),
  );

  const events = await (await fetch(base + "/api/v1/events")).json();
  const eventId = events.events?.[0]?.eventId;
  check("seeded events exist", Boolean(eventId), eventId ?? "none");

  await goto("#/events", "#event-table");
  check("events list renders", (await text("#view")).includes(eventId));

  await goto(`#/event/${eventId}`, "#timeline");
  check("incident detail + timeline", (await page.$("#timeline")) !== null);

  // replay: press play, position must advance
  await page.click("#replay-play").catch(() => null);
  await sleep(1400);
  const pos = await text("#replay-pos").catch(() => "");
  check("timeline replay advances", /\d+\s*\/\s*\d+/.test(pos) && !/^0\s*\//.test(pos), pos.trim());
  await page.click("#replay-play").catch(() => null); // pause

  await goto(`#/capsule/${eventId}`, "#tamper-verify");
  const cap = await text("#view");
  check("capsule renders + verifies", /VERIFIED|verified/i.test(cap));
  await page.click("#cap-audit");
  await page.waitForFunction(() => document.querySelector("#audit-result")?.textContent.includes("AUDIT"));
  check("receipt arithmetic audit passes", /AUDIT PASS/.test(await text("#audit-result")));

  // tamper: corrupt the receipt symbol, then verify → must fail
  await page.evaluate(() => {
    const ta = document.querySelector("#tamper-json");
    if (ta) ta.value = ta.value.replace(/"symbol":\s*"([^"]+)"/, '"symbol": "HACKED"');
  });
  await page.click("#tamper-verify");
  await sleep(400);
  const tamper = await text("#tamper-result");
  check("tampered receipt rejected", /INVALID|mismatch|fail/i.test(tamper), tamper.trim().slice(0, 60));

  await goto("#/watchlist", "#wl-add");
  check("watchlist view mounts", (await cards()) > 0);
  await page.evaluate(() => (location.hash = "#/diagnostics"));
  await page.waitForFunction(() => document.querySelector("#view")?.textContent?.includes("Data source"), {
    timeout: 15_000,
  });
  check("diagnostics view mounts", /fixture|capabilities/i.test(await text("#view")));
  await page.evaluate(() => (location.hash = "#/about"));
  await page.waitForFunction(
    () => document.querySelector("#view")?.textContent?.includes("tokenized reality"),
    { timeout: 15_000 },
  );
  check("about view mounts", (await cards()) > 0);

  check(
    "zero console errors across all views",
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(" | "),
  );
} catch (err) {
  check("fatal", false, err.message);
  await page?.screenshot({ path: fileURLToPath(new URL("failure.png", screenshotDir)) }).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  child?.kill("SIGTERM");
  await sleep(500);
  child?.kill("SIGKILL");
}

const failed = results.filter(([, ok]) => !ok);
console.log(
  `\n${failed.length === 0 ? "PASS" : "FAIL"} — ${results.length - failed.length}/${results.length} checks`,
);
process.exit(failed.length === 0 ? 0 : 1);
