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
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Spawn the server directly (not via pnpm) so child.kill() reaches the actual
// node process — on Windows a pnpm/cmd wrapper leaves the server orphaned.
const WEB_DIR = fileURLToPath(new URL("../apps/web", import.meta.url));

const portProbe = createServer();
await new Promise((resolve, reject) => {
  portProbe.once("error", reject);
  portProbe.listen(Number(process.env.MIRRORGAP_E2E_PORT ?? 0), "127.0.0.1", resolve);
});
const PORT = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
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
  child = spawn(
    process.execPath,
    ["--import", new URL("./browser-clock.mjs", import.meta.url).href, "--import", "tsx", "src/server.ts"],
    {
      env: {
        ...process.env,
        PORT: String(PORT),
        MIRRORGAP_HOST: "127.0.0.1",
        MIRRORGAP_DATA_MODE: "fixture",
        MIRRORGAP_DB_PATH: ":memory:",
        MIRRORGAP_FIXTURE_SCENARIO: "incident_cycle",
        MIRRORGAP_SEED_TICKS: "31",
        MIRRORGAP_CONFIRM_SCANS: "1",
        MIRRORGAP_NO_LOOP: "1",
        MIRRORGAP_SCAN_TOKEN: "",
      },
      cwd: WEB_DIR,
      stdio: "pipe",
    },
  );
  let startupError = "";
  child.stderr.on("data", (chunk) => {
    startupError += chunk.toString();
  });
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await sleep(1000);
    try {
      ready = (await fetch(base + "/api/v1/healthz", { signal: AbortSignal.timeout(2000) })).ok;
    } catch {}
  }
  if (!ready) throw new Error(`server did not start in 90s: ${startupError.slice(-1500)}`);
  check("fixture server boots + seeds", true);

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    protocolTimeout: 30000,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=2",
      "--window-size=1440,900",
      "--disable-extensions",
      "--no-proxy-server",
    ],
  });
  page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1440, height: 900 });
  const consoleErrors = [];
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method() }));
  await page.evaluateOnNewDocument(() => {
    const NativeDate = Date;
    const started = NativeDate.now();
    const pinned = NativeDate.parse("2026-09-18T15:00:00.000Z");
    globalThis.Date = class extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [pinned + NativeDate.now() - started]));
      }
      static now() {
        return pinned + NativeDate.now() - started;
      }
    };
    const NativeEventSource = EventSource;
    globalThis.__streams = [];
    globalThis.EventSource = class extends NativeEventSource {
      constructor(...args) {
        super(...args);
        globalThis.__streams.push(this);
      }
    };
    globalThis.__downloads = [];
    const create = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      blob.text().then((t) => globalThis.__downloads.push(t));
      return create(blob);
    };
  });
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
    await page.waitForSelector(sel, { timeout: 45_000 });
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
  await page.waitForSelector(".divergence-map", { timeout: 45_000 });
  check("overview mounts", (await cards()) > 0);
  // badge is populated by the view's data fetch — wait for it to resolve
  await page.waitForFunction(() => (document.querySelector("#mode-badge")?.textContent ?? "…") !== "…", {
    timeout: 10_000,
  });
  check("fixture banner visible", (await text("#fixture-banner")).trim().length > 0);
  check("mode badge = fixture", /fixture/i.test(await text("#mode-badge")));

  await page.click(".registration:nth-of-type(1)");
  check(
    "bench mark and ledger selection agree",
    await page.evaluate(() => {
      const mark = document.querySelector(".registration[aria-pressed=true]");
      return (
        document.querySelector(".bench-inspector h3").textContent === mark.dataset.wrapper &&
        document.querySelector("tr.selected").dataset.ledger === mark.dataset.wrapper
      );
    }),
  );
  await page.select("#instrument-asset", "2");
  await page.waitForFunction(() => document.querySelector(".journey-title")?.textContent.includes("NVDA"));
  check("retained journey follows selected asset", /NVDA/.test(await text(".journey-title")));
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
  await page.click(".bench-inspector a");
  await page.waitForSelector("#asset-wrapper");
  check("overview investigation link opens selected asset", (await page.url()).endsWith("#/asset/2"));
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
  await page.click(".field-dot");
  check(
    "desk wrapper inspection shows exact values",
    /Token.*CMC aggregate.*signed gap/.test(await text("#wrapper-inspector")),
  );
  await page.click("#asset-table .asset-link");
  await page.waitForSelector("#asset-wrapper");
  await page.goBack();
  await page.waitForSelector("#radar-filter");
  check(
    "browser back retains desk filter and selected wrapper",
    (await page.$eval("#radar-filter", (e) => e.value === "NVDA")) &&
      /NVD/.test(await text("#wrapper-inspector")),
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

  check(
    "refused quote preserves entries",
    await page.$eval("[name=source]", (e) => e.value === "Browser test synthetic input"),
  );
  await page.select("[name=dataMode]", "fixture");
  await page.$eval("#underlying-compare", (f) => f.requestSubmit());
  await page.waitForFunction(() =>
    document.querySelector("#underlying-result")?.textContent.includes("indicative"),
  );
  check(
    "valid quote produces indicative comparison with explicit units",
    /Expected token price: 100/.test(await text("#underlying-result")),
  );
  await page.click("#tab-history");
  await page.click('[data-win="all"]');
  await sleep(1000);
  await page.waitForFunction(() => document.querySelector('[data-win="all"]')?.classList.contains("active"));
  await page.click("#tab-comparison");
  check(
    "history window changes preserve manual quote",
    await page.$eval("[name=source]", (e) => e.value === "Browser test synthetic input"),
  );
  await page.click("#review-download");
  await page.waitForFunction(() => globalThis.__downloads.length > 0);
  const exported = JSON.parse(await page.evaluate(() => globalThis.__downloads.at(-1)));
  check(
    "review JSON export preserves mode and quote",
    exported.dataMode === "fixture" &&
      exported.underlying.quote.price === 100 &&
      Boolean(exported.reportHash),
  );
  writeFileSync(new URL("browser-review.json", screenshotDir), JSON.stringify(exported, null, 2));
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: fileURLToPath(new URL(`manual-${width}.png`, screenshotDir)),
      fullPage: true,
    });
  }
  await page.setViewport({ width: 1440, height: 900 });
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

  await page.click('.tl-item[data-i="4"]');
  await page.keyboard.press("ArrowRight");
  check("keyboard replay advances selected frame", /^6\//.test(await text("#replay-pos")));
  await page.keyboard.press("Home");
  check(
    "replay Home selects first historical frame",
    /^1\//.test(await text("#replay-pos")) && /historical/.test(await text("#replay-frame")),
  );
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: fileURLToPath(new URL(`replay-${width}.png`, screenshotDir)),
      fullPage: true,
    });
  }
  await page.click("#replay-play");
  await page.evaluate(() => {
    globalThis.__oldReplay = document.querySelector("#view").firstElementChild;
  });
  await goto(`#/capsule/${eventId}`, "#tamper-verify");
  const stopped = await page.evaluate(() => globalThis.__oldReplay.querySelector("#replay-pos").textContent);
  await sleep(1000);
  check(
    "route cleanup stops detached replay",
    stopped === (await page.evaluate(() => globalThis.__oldReplay.querySelector("#replay-pos").textContent)),
  );
  await page.setViewport({ width: 1440, height: 900 });
  const cap = await text("#view");
  check(
    "capsule renders + verifies",
    /Integrity checks passed/.test(cap) &&
      /Not yet audited/.test(cap) &&
      /Unsigned|Signature valid/.test(cap),
  );
  await page.click('[data-claim-kind="unknown"]');
  check(
    "capsule claim categories remain inspectable",
    (await page.$$eval(".capsule-claims .claim", (els) =>
      els.filter((e) => !e.hidden).every((e) => e.classList.contains("unknown")),
    )) && /unknown claims/.test(await text("#claim-filter-status")),
  );
  await page.click('[data-claim-kind="all"]');
  await page.click("#cap-audit");
  await page.waitForFunction(() => document.querySelector("#audit-result")?.textContent.includes("AUDIT"));
  check("receipt arithmetic audit passes", /AUDIT PASS/.test(await text("#audit-result")));

  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: fileURLToPath(new URL(`capsule-${width}.png`, screenshotDir)),
      fullPage: true,
    });
  }
  await page.setViewport({ width: 1440, height: 900 });
  await page.click("#cap-download");
  await page.waitForFunction(() => globalThis.__downloads.some((t) => JSON.parse(t).capsuleVersion));
  check(
    "capsule export includes fixed receipt and data mode",
    await page.evaluate(() => {
      const c = globalThis.__downloads.map(JSON.parse).find((c) => c.capsuleVersion);
      return c.dataMode === "fixture" && c.receipt.dataMode === "fixture" && Boolean(c.receipt.receiptHash);
    }),
  );
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
  await page.type("#wl-symbol", "NVDA");
  await page.type("#wl-info", "2");
  await page.$eval("#wl-add", (f) => f.requestSubmit());
  check("watchlist validates four thresholds inline", /all four/.test(await text("#wl-feedback")));
  await page.evaluate(() => {
    for (const [k, v] of Object.entries({ info: "0.5", watch: "1", high: "2", critical: "4" }))
      document.querySelector("#wl-" + k).value = v;
    document.querySelector("#wl-add").requestSubmit();
  });
  await page.waitForFunction(() => document.querySelector("#wl-feedback")?.textContent.includes("Saved"));
  check("watchlist reports successful save", /Saved/.test(await text("#wl-feedback")));
  await page.evaluate(() => (location.hash = "#/diagnostics"));
  await page.waitForFunction(() => document.querySelector("#view")?.textContent?.includes("Data source"), {
    timeout: 45_000,
  });
  check("diagnostics view mounts", /fixture|capabilities/i.test(await text("#view")));
  await page.evaluate(() => (location.hash = "#/about"));
  await page.waitForFunction(
    () => document.querySelector("#view")?.textContent?.includes("tokenized reality"),
    { timeout: 45_000 },
  );
  check("about view mounts", (await cards()) > 0);

  check(
    "no presentation-triggered scans",
    requests.filter((r) => r.method === "POST" && r.url.endsWith("/api/v1/scan")).length === 0,
  );
  check(
    "zero console errors across all views",
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(" | "),
  );
  await goto("#/overview", "#instrument-asset");
  await page.select("#instrument-asset", "2");
  const selectedWrapper = await page.$eval(".registration[aria-pressed=true]", (e) => e.dataset.wrapper);
  await page.evaluate(() => {
    document.activeElement?.blur();
    globalThis.__priorBench = document.querySelector("#instrument-asset");
    globalThis.__streams[0].dispatchEvent(new MessageEvent("snapshot", { data: "{}" }));
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#instrument-asset") &&
      document.querySelector("#instrument-asset") !== globalThis.__priorBench,
  );
  check(
    "SSE refresh retains asset and wrapper selection",
    (await page.$eval("#instrument-asset", (e) => e.value === "2")) &&
      selectedWrapper === (await page.$eval(".registration[aria-pressed=true]", (e) => e.dataset.wrapper)),
  );
  // Deliberate network/presentation states are isolated from console-error checks above.
  const radarFixture = await (await fetch(base + "/api/v1/radar")).json();
  const watchFixture = await (await fetch(base + "/api/v1/watchlist")).json();
  let scenario = "readonly";
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.isInterceptResolutionHandled()) return;
    const path = new URL(r.url()).pathname;
    if (path === "/api/v1/watchlist" && scenario === "readonly")
      return r.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...watchFixture, canMutate: false }),
      });
    if (path === "/api/v1/watchlist" && scenario === "unknown") {
      const d = { ...watchFixture };
      delete d.canMutate;
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    }
    if (path === "/api/v1/radar" && scenario === "failure")
      return r.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Test source unavailable" } }),
      });
    if (path === "/api/v1/radar" && scenario === "missing")
      return r.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...radarFixture,
          assets: radarFixture.assets.map((a) => ({
            ...a,
            gaps: [],
            maxAbsGapPct: null,
            referenceFreshness: "stale",
            referenceState: "unavailable",
          })),
        }),
      });
    if (path === "/api/v1/radar" && scenario === "empty")
      return r.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...radarFixture, assets: [] }),
      });
    r.continue();
  });
  await goto("#/watchlist", "#wl-add");
  check(
    "public read-only controls are disabled",
    (await page.$eval("#wl-add [type=submit]", (e) => e.disabled)) &&
      /read-only/.test(await text("#wl-feedback")),
  );
  scenario = "unknown";
  await goto("#/about", ".prose");
  await goto("#/watchlist", "#wl-add");
  check(
    "unknown capability fails closed",
    (await page.$eval("#wl-add [type=submit]", (e) => e.disabled)) &&
      /unavailable/.test(await text("#wl-feedback")),
  );
  scenario = "failure";
  await goto("#/radar", "[data-retry]");
  check(
    "API failure offers retry without fixture substitution",
    /Test source unavailable/.test(await text("#view")),
  );
  scenario = "missing";
  await goto("#/overview", ".instrument");
  check(
    "missing measurements are not drawn at zero",
    (await page.$$eval(".registration", (els) => els.length === 0)) &&
      /Comparison plane unavailable/.test(await text(".instrument")) &&
      /stale/.test(await text(".instrument")),
  );
  scenario = "empty";
  await goto("#/about", ".prose");
  await goto("#/overview", ".instrument");
  check(
    "empty observatory explains missing evidence",
    /awaiting observations/.test(await text(".instrument")),
  );
  scenario = "normal";
  await goto("#/about", ".prose");
  await goto("#/overview", "#instrument-asset");
  await page.evaluate(() => {
    globalThis.__streams.forEach((s) => {
      s.close();
      s.dispatchEvent(new Event("error"));
    });
  });
  check(
    "disconnected SSE preserves explicit fixture mode",
    /disconnected/.test(await text("#stream-label")) && /fixture/.test(await text("#mode-badge")),
  );
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.waitForSelector('[data-chapter="2"]');
  await page.click('[data-chapter="2"]');
  check(
    "reduced-motion chapter control remains usable",
    await page.$eval("#chapter-2", (e) => e === document.activeElement),
  );
  for (const width of [360, 390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(
      `overview fits ${width}px`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
  }
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate(() => (document.documentElement.style.zoom = "2"));
  check(
    "200% zoom keeps page within viewport",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.screenshot({
    path: fileURLToPath(new URL("overview-zoom200.png", screenshotDir)),
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.style.zoom = ""));
  const interactionMs = await page.evaluate(async () => {
    const start = performance.now();
    document.querySelector(".registration").click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - start;
  });
  const perf = await page.evaluate(() => ({
    navigation: performance
      .getEntriesByType("navigation")
      .map((n) => ({ domContentLoadedMs: n.domContentLoadedEventEnd, loadMs: n.loadEventEnd })),
    resources: performance
      .getEntriesByType("resource")
      .filter((r) => /\.(js|css|svg)$/.test(r.name))
      .map((r) => ({ url: r.name, bytes: r.encodedBodySize, durationMs: r.duration })),
  }));
  writeFileSync(
    new URL("performance.json", screenshotDir),
    JSON.stringify({ ...perf, registrationClickToTwoFramesMs: interactionMs }, null, 2),
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
