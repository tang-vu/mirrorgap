import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime, seedHistory } from "@mirrorgap/runtime";
import { createApiHandler, json } from "./api.js";

const PORT = Number(process.env.PORT ?? process.env.MIRRORGAP_PORT ?? 8787);
const HOST = process.env.MIRRORGAP_HOST ?? "0.0.0.0";
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  // The SPA is self-contained: scripts load from 'self' only (no inline
  // handlers); style attributes are permitted for dynamic bar widths.
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (path.includes("..")) return false;
  let file = join(PUBLIC_DIR, path);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    // SPA fallback
    file = join(PUBLIC_DIR, "index.html");
    if (!existsSync(file)) return false;
  }
  const body = await readFile(file);
  res.writeHead(200, {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
    "cache-control": file.endsWith("index.html") ? "no-cache" : "public, max-age=60",
  });
  res.end(body);
  return true;
}

async function main(): Promise<void> {
  const instance = createRuntime();

  // Optional deterministic history seeding (fixture mode only). Replays real
  // scans at pinned timestamps so the observatory boots with a full incident
  // lifecycle already on record — the demo path. Never active in live mode.
  const seedTicks = Math.max(0, Number(process.env.MIRRORGAP_SEED_TICKS ?? "0") || 0);
  if (seedTicks > 0 && instance.config.dataMode === "fixture") {
    const t0 = Date.now();
    await seedHistory(instance.runtime, { ticks: seedTicks });
    console.log(`[seed] ${seedTicks} fixture scans replayed in ${Date.now() - t0}ms`);
  }

  const api = createApiHandler(instance);

  const server = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    // Read API is public; mutations enforce their own origin/token guards.
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,x-scan-token");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      if (await api(req, res)) return;
      if (req.method === "GET" && (await serveStatic(req, res))) return;
      json(res, 404, { error: { code: "not_found", message: "not found" } });
    } catch (err) {
      json(res, 500, {
        error: { code: "internal", message: err instanceof Error ? err.message : String(err) },
      });
    }
  });

  // Continuous observation loop — the observatory never sleeps.
  const intervalMs = Math.max(15, instance.config.scanIntervalSeconds) * 1000;
  let scanning = false;
  const tick = async () => {
    if (scanning) return;
    scanning = true;
    try {
      await instance.runtime.scan();
    } catch (err) {
      console.error("[scan] failed:", err instanceof Error ? err.message : err);
    } finally {
      scanning = false;
    }
  };
  const runLoop = process.env.MIRRORGAP_NO_LOOP !== "1";
  if (runLoop) {
    void tick();
    setInterval(tick, intervalMs).unref();
  }

  server.listen(PORT, HOST, () => {
    console.log(
      `MirrorGap observatory → http://localhost:${PORT}  (mode=${instance.config.dataMode}, scan=${instance.config.scanIntervalSeconds}s${runLoop ? "" : ", loop off"})`,
    );
  });

  const shutdown = () => {
    server.close();
    instance.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
