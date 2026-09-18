import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "@mirrorgap/runtime";
import { createApiHandler, json } from "./api.js";

const PORT = Number(process.env.PORT ?? process.env.MIRRORGAP_PORT ?? 8787);
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
  const api = createApiHandler(instance);

  const server = createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,x-scan-token");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      if (await api(req, res)) return;
      if (req.method === "GET" && (await serveStatic(req, res))) return;
      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
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

  server.listen(PORT, () => {
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
