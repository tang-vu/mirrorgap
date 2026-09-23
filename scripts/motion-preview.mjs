import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { build } from "esbuild";

const root = process.cwd();
const publicDir = resolve(root, "apps/web/public");
const output = resolve(root, "data/motion-preview");
mkdirSync(output, { recursive: true });
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  cwd: resolve(root, "apps/web"),
  env: {
    ...process.env,
    PORT: String(port),
    MIRRORGAP_HOST: "127.0.0.1",
    MIRRORGAP_DATA_MODE: "fixture",
    MIRRORGAP_DB_PATH: ":memory:",
    MIRRORGAP_SEED_TICKS: "31",
    MIRRORGAP_CONFIRM_SCANS: "1",
    MIRRORGAP_NO_LOOP: "1",
    MIRRORGAP_SCAN_TOKEN: "",
  },
  stdio: "pipe",
});
let stderr = "";
server.stderr.on("data", (d) => (stderr += d.toString()));
let ready = false;
for (let i = 0; i < 90; i++) {
  try {
    ready = (await fetch(base + "/api/v1/healthz", { signal: AbortSignal.timeout(1000) })).ok;
  } catch {}
  if (ready) break;
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) throw new Error(`Fixture server failed: ${stderr.slice(-500)}`);
const bundle = await build({
  entryPoints: [resolve(publicDir, "app.js")],
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
  target: "es2022",
});
const css = ["style.css", "desk.css", "motion.css"]
  .map((f) => readFileSync(resolve(publicDir, f), "utf8"))
  .join("\n");
const gsap = readFileSync(resolve(publicDir, "vendor/gsap.min.js"), "utf8");
const scroll = readFileSync(resolve(publicDir, "vendor/ScrollTrigger.min.js"), "utf8");
const html = readFileSync(resolve(publicDir, "index.html"), "utf8")
  .replace(/<link rel="stylesheet" href="\/[^"]+" \/>/g, "")
  .replace(/<script[^>]+src="\/[^"]+"[^>]*><\/script>/g, "")
  .replace("</head>", `<style>${css}</style></head>`);
const browser = await puppeteer.launch({
  executablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--no-sandbox", "--no-proxy-server", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.exposeFunction("__bridgeFetch", async (path, init) => {
  const res = await fetch(new URL(path, base), {
    method: init?.method ?? "GET",
    headers: init?.headers ?? {},
    body: init?.body,
  });
  return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers) };
});
await page.evaluateOnNewDocument(() => {});
const mountStarted = performance.now();
await page.setContent(html, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  window.fetch = async (path, init) => {
    const result = await window.__bridgeFetch(path, init);
    return new Response(result.body, { status: result.status, headers: result.headers });
  };
  window.EventSource = class {
    addEventListener() {}
    close() {}
  };
});
await page.addScriptTag({ content: gsap });
await page.addScriptTag({ content: scroll });
await page.addScriptTag({ content: bundle.outputFiles[0].text });
await page.waitForSelector(".apparatus-carriage", { timeout: 30000 });
const details = {
  dataMode: await page.$eval("#mode-badge", (e) => e.textContent),
  gsap: await page.evaluate(() => Boolean(window.gsap && window.ScrollTrigger)),
  errors,
};
details.browserMountMs = Math.round(performance.now() - mountStarted);
details.staticBytes =
  ["style.css", "desk.css", "motion.css", "vendor/gsap.min.js", "vendor/ScrollTrigger.min.js"].reduce(
    (total, file) => total + readFileSync(resolve(publicDir, file)).byteLength,
    0,
  ) + Buffer.byteLength(bundle.outputFiles[0].text);
await page.screenshot({ path: resolve(output, "opening-viewport.png") });
await page.evaluate(() => scrollTo(0, 220));
for (let i = 0; i <= 20; i++) {
  await page.screenshot({ path: resolve(output, `opening-${String(i).padStart(2, "0")}.png`) });
  await new Promise((r) => setTimeout(r, 100));
}
await page.waitForSelector(".story-stage", { timeout: 30000 });
for (let i = 0; i <= 20; i++) {
  await page.evaluate((fraction) => {
    const journey = document.querySelector(".journey-layout");
    const top = journey.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + (journey.offsetHeight - innerHeight) * fraction);
  }, i / 20);
  await new Promise((r) => setTimeout(r, 60));
  await page.screenshot({ path: resolve(output, `journey-${String(i).padStart(2, "0")}.png`) });
}
const eventId = await page.$eval(".incident-ledger .asset-link", (e) => e.href.split("/").at(-1));
await page.evaluate((id) => (location.hash = `#/capsule/${id}`), eventId);
await page.waitForSelector(".seal-sheet", { timeout: 30000 });
details.capsuleStyle = await page.$eval(".capsule-head", (e) => ({
  background: getComputedStyle(e).backgroundColor,
  color: getComputedStyle(e).color,
  height: e.getBoundingClientRect().height,
}));
await page.$eval(".seal-sheet", (e) => e.scrollIntoView({ block: "center" }));
for (let i = 0; i <= 8; i++) {
  await page.screenshot({ path: resolve(output, `seal-${String(i).padStart(2, "0")}.png`) });
  await new Promise((r) => setTimeout(r, 100));
}
await page.click("#cap-audit");
await page.waitForFunction(() => document.querySelector(".seal-sheet")?.dataset.state === "passed", {
  timeout: 20000,
});
await page.$eval(".seal-sheet", (e) => e.scrollIntoView({ block: "center" }));
await page.screenshot({ path: resolve(output, "seal-pass.png") });
for (let i = 0; i <= 9; i++) {
  await page.screenshot({ path: resolve(output, `seal-audit-${String(i).padStart(2, "0")}.png`) });
  await new Promise((r) => setTimeout(r, 70));
}
await page.$eval("#tamper-json", (e) => {
  e.value = e.value.replace(/"symbol":\s*"([^"]+)"/, '"symbol": "HACKED"');
  e.dispatchEvent(new Event("input"));
});
await page.click("#tamper-verify");
await page.waitForFunction(() => document.querySelector(".seal-sheet")?.dataset.state === "failed", {
  timeout: 20000,
});
await page.$eval(".seal-sheet", (e) => e.scrollIntoView({ block: "center" }));
await page.screenshot({ path: resolve(output, "seal-fail.png") });
for (let i = 0; i <= 9; i++) {
  await page.screenshot({ path: resolve(output, `seal-tamper-${String(i).padStart(2, "0")}.png`) });
  await new Promise((r) => setTimeout(r, 70));
}
await page.click("#tamper-reset");
await page.$eval(".seal-sheet", (e) => e.scrollIntoView({ block: "center" }));
await page.screenshot({ path: resolve(output, "seal-reset.png") });
details.resetState = await page.$eval(".seal-sheet", (e) => e.dataset.state);
await page.setViewport({ width: 390, height: 844 });
await page.click("#cap-audit");
await page.waitForFunction(() => document.querySelector(".seal-sheet")?.dataset.state === "passed", {
  timeout: 20000,
});
await page.$eval(".seal-sheet", (e) => e.scrollIntoView({ block: "center" }));
for (let i = 0; i <= 9; i++) {
  await page.screenshot({ path: resolve(output, `mobile-seal-audit-${String(i).padStart(2, "0")}.png`) });
  await new Promise((r) => setTimeout(r, 70));
}
await page.$eval("#tamper-json", (e) => {
  e.value = e.value.replace(/"symbol":\s*"([^"]+)"/, '"symbol": "HACKED"');
  e.dispatchEvent(new Event("input"));
});
await page.click("#tamper-verify");
await page.waitForFunction(() => document.querySelector(".seal-sheet")?.dataset.state === "failed", {
  timeout: 20000,
});
await page.$eval(".seal-sheet", (e) => e.scrollIntoView({ block: "center" }));
for (let i = 0; i <= 9; i++) {
  await page.screenshot({ path: resolve(output, `mobile-seal-tamper-${String(i).padStart(2, "0")}.png`) });
  await new Promise((r) => setTimeout(r, 70));
}
await page.click("#tamper-reset");
await page.evaluate(() => (location.hash = "#/overview"));
await page.waitForSelector(".apparatus-carriage", { timeout: 30000 });
await page.screenshot({ path: resolve(output, "mobile-opening.png") });
await page.evaluate(() => scrollTo(0, 400));
for (let i = 0; i <= 20; i++) {
  await page.screenshot({ path: resolve(output, `mobile-opening-${String(i).padStart(2, "0")}.png`) });
  await new Promise((r) => setTimeout(r, 100));
}
for (let i = 0; i <= 20; i++) {
  await page.evaluate((fraction) => {
    const journey = document.querySelector(".journey-layout");
    const top = journey.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + (journey.offsetHeight - innerHeight) * fraction);
  }, i / 20);
  await new Promise((r) => setTimeout(r, 60));
  await page.screenshot({ path: resolve(output, `mobile-journey-${String(i).padStart(2, "0")}.png`) });
}
details.forwardIdentity = await page.$eval(".story-stage .story-head", (e) => e.textContent);
await page.evaluate(() => {
  const journey = document.querySelector(".journey-layout");
  scrollTo(0, journey.getBoundingClientRect().top + scrollY);
});
await new Promise((r) => setTimeout(r, 120));
details.reverseIdentity = await page.$eval(".story-stage .story-head", (e) => e.textContent);
await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
await new Promise((r) => setTimeout(r, 120));
details.fastScrollStageExists = await page.$eval(".story-stage", (e) => e.isConnected);
details.mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
details.selection = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll(".registration")];
  if (buttons.length < 2) return { available: false };
  const before = document.querySelector(".apparatus-carriage")?.style.left;
  buttons[1].click();
  return {
    available: true,
    before,
    selected: buttons[1].dataset.wrapper,
    pressed: buttons[1].getAttribute("aria-pressed"),
    inspector: document.querySelector(".bench-inspector h3")?.textContent,
  };
});
await new Promise((r) => setTimeout(r, 750));
details.selection.after = await page.$eval(".apparatus-carriage", (e) => e.style.left);
details.identity = await page.$eval(".story-stage .story-head", (e) => e.textContent);
details.scrollTriggerBeforeExit = await page.evaluate(() => window.ScrollTrigger.getAll().length);
await page.evaluate(() => (location.hash = "#/about"));
await page.waitForSelector(".prose", { timeout: 30000 });
details.scrollTriggerAfterExit = await page.evaluate(() => window.ScrollTrigger.getAll().length);
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await page.evaluate(() => (location.hash = "#/overview"));
await page.waitForSelector(".story-stage", { timeout: 30000 });
details.reducedMotion = await page.evaluate(() => ({
  activeTriggers: window.ScrollTrigger.getAll().length,
  slipOpacity: getComputedStyle(document.querySelector(".story-slip")).opacity,
}));
details.frameMs = await page.evaluate(async () => {
  const values = [];
  let last = performance.now();
  for (let i = 0; i < 60; i++)
    await new Promise((resolve) =>
      requestAnimationFrame(() => {
        const now = performance.now();
        values.push(now - last);
        last = now;
        resolve();
      }),
    );
  values.sort((a, b) => a - b);
  return { median: values[30], p95: values[57] };
});
details.errors = errors;
writeFileSync(resolve(output, "validation.json"), JSON.stringify(details, null, 2));
console.log(details);
await browser.disconnect();
server.kill("SIGTERM");
process.exit(errors.length ? 1 : 0);
