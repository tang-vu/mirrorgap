import type { IncomingMessage, ServerResponse } from "node:http";
import type { RuntimeInstance } from "@mirrorgap/runtime";
import { CmcError } from "@mirrorgap/cmc";
import {
  verifyReceipt,
  auditReceipt,
  UnderlyingQuoteSchema,
  HISTORY_WINDOWS,
  type HistoryWindow,
  type Thresholds,
} from "@mirrorgap/core";

type Params = Record<string, string>;
type Handler = (req: IncomingMessage, res: ServerResponse, params: Params) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const MAX_BODY = 64 * 1024; // mutation payloads are small; cap hard

function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replaceAll(/:(\w+)/g, (_, k: string) => {
        keys.push(k);
        return "([^/]+)";
      }) +
      "$",
  );
  return { method, pattern, keys, handler };
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

function fail(res: ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { error: { code, message } });
}

/** Body errors carry an HTTP status + code so callers see 413/400, not a generic failure. */
class BodyError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Read a JSON body with a hard size cap. Rejects oversized/invalid bodies. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new BodyError(413, "payload_too_large", "request body exceeds 64 KiB"));
        // Drain the remainder without accumulating so the socket stays alive and the
        // 413 response reaches the client (destroy() would reset it mid-send).
        req.removeAllListeners("data");
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new BodyError(400, "bad_json", "request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function bodyFail(res: ServerResponse, err: unknown): void {
  if (err instanceof BodyError) return fail(res, err.status, err.code, err.message);
  fail(res, 400, "bad_body", err instanceof Error ? err.message : String(err));
}

function query(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? "", "http://x").searchParams;
}

function boundedInt(raw: string | null, lo: number, hi: number, dflt: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

const VALID_STATUSES = new Set(["candidate", "confirmed", "resolved", "invalidated"]);
const VALID_SEVERITIES = new Set(["none", "info", "watch", "high", "critical"]);

export function apiRoutes(instance: RuntimeInstance): Route[] {
  const { runtime, config, diagnostics } = instance;

  /**
   * Fixed-window rate limiter on mutations (scan triggers, watchlist writes).
   * Read endpoints are unlimited — they serve the observatory UI. Mutations
   * trigger CMC calls, so they get a per-IP cap: MUTATION_LIMIT per minute.
   */
  const MUTATION_LIMIT = 30;
  const WINDOW_MS = 60_000;
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const rateLimited = (req: IncomingMessage, res: ServerResponse): boolean => {
    const ip = req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(ip, b);
      // bound the map: drop expired windows opportunistically
      if (buckets.size > 10_000) {
        for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      }
    }
    b.count += 1;
    if (b.count <= MUTATION_LIMIT) return false;
    res.setHeader("retry-after", Math.ceil((b.resetAt - now) / 1000));
    fail(res, 429, "rate_limited", `mutation rate limit exceeded (${MUTATION_LIMIT}/min)`);
    return true;
  };

  /**
   * Mutation guard: protects scan triggers + watchlist writes.
   * - Always enforces loopback-only when no scan token is configured.
   * - Blocks cross-site browser requests (CSRF on loopback deployments):
   *   a mutation carrying an Origin whose host doesn't match the request
   *   Host is rejected.
   * - Applies the mutation rate limit after auth checks pass.
   */
  const guardMutation = (req: IncomingMessage, res: ServerResponse): boolean => {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const o = new URL(origin);
        const host = req.headers.host ?? "";
        if (o.host !== host) {
          fail(res, 403, "forbidden_origin", "cross-origin mutations are not allowed");
          return false;
        }
      } catch {
        fail(res, 403, "forbidden_origin", "invalid Origin header");
        return false;
      }
    }
    if (!config.scanToken) {
      const ip = req.socket.remoteAddress ?? "";
      if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
        return !rateLimited(req, res);
      }
      fail(res, 403, "loopback_only", "mutations restricted to localhost without MIRRORGAP_SCAN_TOKEN");
      return false;
    }
    const tok = req.headers["x-scan-token"] ?? query(req).get("token");
    if (tok === config.scanToken) return !rateLimited(req, res);
    fail(res, 403, "scan_token_required", "valid x-scan-token required");
    return false;
  };

  return [
    route("GET", "/api/v1/health", (_r, res) => {
      json(res, 200, {
        status: "ok",
        dataMode: config.dataMode,
        capabilities: runtime.capabilities(),
        uptimeSeconds: Math.round(process.uptime()),
      });
    }),

    // Deployment probes — healthz: process alive; readyz: store readable.
    route("GET", "/api/v1/healthz", (_r, res) => json(res, 200, { ok: true })),
    route("GET", "/api/v1/readyz", (_r, res) => {
      try {
        instance.runtime.store.latestScan();
        json(res, 200, { ok: true, dataMode: config.dataMode });
      } catch (err) {
        fail(res, 503, "not_ready", err instanceof Error ? err.message : String(err));
      }
    }),

    route("GET", "/api/v1/overview", (_r, res) => {
      json(res, 200, runtime.overview());
    }),

    route("GET", "/api/v1/radar", (_r, res) => {
      const rows = runtime.radar().map(({ asset, snapshot }) => ({
        rwaId: asset.rwaId,
        symbol: asset.symbol,
        name: asset.name,
        assetType: asset.assetType,
        primaryExchange: asset.primaryExchange,
        severity: snapshot.severity,
        classification: snapshot.classification,
        measuredAt: snapshot.measuredAt,
        referenceState: snapshot.reference.state,
        underlyingMarket: snapshot.reference.underlyingMarket,
        referenceFreshness: snapshot.reference.aggregateFreshness.state,
        gaps: snapshot.gaps.map((g) => ({
          tokenSymbol: g.tokenSymbol,
          gapPct: g.gapPct,
          tokenPrice: g.tokenPrice,
          referencePrice: g.referencePrice,
        })),
        maxAbsGapPct: snapshot.gaps.reduce((m, g) => Math.max(m, Math.abs(g.gapPct)), 0) || null,
        dispersionPct: snapshot.dispersion.dispersionPct,
        wrapperCount: snapshot.dispersion.wrapperCount,
        dataQuality: snapshot.dataQuality.score,
      }));
      json(res, 200, {
        dataMode: config.dataMode,
        marketPairs: runtime.capabilities().marketPairs,
        generatedAt: new Date().toISOString(),
        assets: rows,
      });
    }),

    route("GET", "/api/v1/assets", (req, res) => {
      const q = query(req).get("q") ?? "";
      const assets = q ? instance.runtime.store.searchAssets(q) : instance.runtime.store.listAssets();
      json(res, 200, { assets });
    }),

    route("GET", "/api/v1/assets/:rwaId", (_r, res, p) => {
      const rwaId = Number(p["rwaId"]);
      if (!Number.isInteger(rwaId)) return fail(res, 400, "bad_id", "rwaId must be an integer");
      const asset = instance.runtime.store.getAsset(rwaId);
      if (!asset) return fail(res, 404, "not_found", "unknown rwa_id");
      const snapshot = instance.runtime.store.latestSnapshot(rwaId);
      const reps = instance.runtime.store.listRepresentations(rwaId);
      const events = instance.runtime.store.listEvents({ limit: 50, rwaId });
      const watch = instance.runtime.store.getWatchEntry(rwaId);
      json(res, 200, {
        asset,
        representations: reps,
        snapshot,
        events,
        watched: watch?.enabled ?? false,
        thresholds: watch?.thresholds ?? config.thresholds,
        dataMode: config.dataMode,
      });
    }),

    route("GET", "/api/v1/assets/:rwaId/workbench", (_req, res, p) => {
      const id = Number(p["rwaId"]);
      if (!Number.isSafeInteger(id) || id <= 0)
        return fail(res, 400, "bad_id", "rwaId must be a positive integer");
      const report = runtime.workbench(id);
      if (!report) return fail(res, 404, "not_found", "asset has no snapshot; run a scan first");
      json(res, 200, report);
    }),

    route("POST", "/api/v1/assets/:rwaId/compare", async (req, res, p) => {
      if (rateLimited(req, res)) return;
      const id = Number(p["rwaId"]);
      if (!Number.isSafeInteger(id) || id <= 0)
        return fail(res, 400, "bad_id", "rwaId must be a positive integer");
      const parsed = UnderlyingQuoteSchema.safeParse(await readJsonBody(req));
      if (!parsed.success)
        return fail(
          res,
          400,
          "bad_quote",
          "Quote requires asset, positive price, currency, unit, timestamp, source, clean HTTPS URL, dataMode and unique wrapper unit mappings",
        );
      const report = runtime.workbench(id, parsed.data);
      if (!report) return fail(res, 404, "not_found", "asset has no snapshot; run a scan first");
      json(res, 200, report);
    }),

    route("POST", "/api/v1/receipts/audit", async (req, res) => {
      if (rateLimited(req, res)) return;
      json(res, 200, auditReceipt(await readJsonBody(req)));
    }),

    route("GET", "/api/v1/assets/:rwaId/history", (req, res, p) => {
      const rwaId = Number(p["rwaId"]);
      if (!Number.isInteger(rwaId)) return fail(res, 400, "bad_id", "rwaId must be an integer");
      if (!instance.runtime.store.getAsset(rwaId)) {
        return fail(res, 404, "not_found", "unknown rwa_id");
      }
      const rawWindow = query(req).get("window") ?? "24h";
      if (!(HISTORY_WINDOWS as readonly string[]).includes(rawWindow)) {
        return fail(res, 400, "bad_window", `window must be one of ${HISTORY_WINDOWS.join(", ")}`);
      }
      const maxPoints = boundedInt(query(req).get("maxPoints"), 16, 2000, 720);
      const h = runtime.assetHistory(rwaId, {
        window: rawWindow as HistoryWindow,
        maxPoints,
      });
      json(res, 200, { rwaId, dataMode: config.dataMode, ...h });
    }),

    route("GET", "/api/v1/events", (req, res) => {
      const q = query(req);
      const status = q.get("status");
      if (status && !VALID_STATUSES.has(status)) {
        return fail(res, 400, "bad_status", `status must be one of ${[...VALID_STATUSES].join(", ")}`);
      }
      const rwaIdRaw = q.get("rwaId");
      const rwaId = rwaIdRaw ? Number(rwaIdRaw) : undefined;
      if (rwaIdRaw && !Number.isInteger(rwaId)) {
        return fail(res, 400, "bad_id", "rwaId must be an integer");
      }
      const limit = boundedInt(q.get("limit"), 1, 500, 100);
      json(res, 200, {
        events: runtime.listEvents({
          ...(status ? { status } : {}),
          ...(rwaId !== undefined ? { rwaId } : {}),
          limit,
        }),
        counts: instance.runtime.store.eventCountsByStatus(),
      });
    }),

    route("GET", "/api/v1/events/:eventId", async (req, res, p) => {
      const d = runtime.getEventDetail(p["eventId"]!);
      if (!d) return fail(res, 404, "not_found", "unknown event");
      const wantExplain = query(req).get("explain");
      const explanation = await runtime.explainEvent(p["eventId"]!, { llm: wantExplain === "llm" });
      json(res, 200, { ...d, explanation, dataMode: config.dataMode });
    }),

    route("GET", "/api/v1/events/:eventId/timeline", (_r, res, p) => {
      const tl = runtime.eventTimeline(p["eventId"]!);
      if (!tl) return fail(res, 404, "not_found", "unknown event");
      json(res, 200, tl);
    }),

    route("GET", "/api/v1/capsules/:eventId", (_r, res, p) => {
      const capsule = runtime.evidenceCapsule(p["eventId"]!);
      if (!capsule) return fail(res, 404, "not_found", "no evidence capsule for event");
      json(res, 200, capsule);
    }),

    route("GET", "/api/v1/receipts/:eventId", (_r, res, p) => {
      const receipt = instance.runtime.store.receiptForEvent(p["eventId"]!);
      if (!receipt) return fail(res, 404, "not_found", "no receipt for event");
      json(res, 200, receipt);
    }),

    route("GET", "/api/v1/receipts/:eventId/verify", (_r, res, p) => {
      const v = runtime.verifyEventReceipt(p["eventId"]!);
      if (!v) return fail(res, 404, "not_found", "no receipt for event");
      json(res, 200, v);
    }),

    // Independent verification: submit any receipt JSON, get schema + hash +
    // signature verdict. Powers the tamper demonstration.
    route("POST", "/api/v1/receipts/verify", async (req, res) => {
      try {
        const body = await readJsonBody(req);
        json(res, 200, verifyReceipt(body));
      } catch (err) {
        bodyFail(res, err);
      }
    }),

    // Public verification key (safe to expose; private key never leaves env).
    route("GET", "/api/v1/verification-key", (_r, res) => {
      json(res, 200, {
        signing: instance.signingConfigured,
        algorithm: instance.signingConfigured ? "ed25519" : null,
        publicKey: instance.publicKey,
      });
    }),

    route("GET", "/api/v1/watchlist", (_r, res) => {
      json(res, 200, {
        watchlist: runtime.listWatchlist(),
        limit: config.watchLimit,
      });
    }),

    route("POST", "/api/v1/watchlist", async (req, res) => {
      if (!guardMutation(req, res)) return;
      try {
        const body = (await readJsonBody(req)) as {
          symbol?: string;
          rwaId?: number;
          enabled?: boolean;
          thresholds?: Partial<Thresholds> | null;
        };
        if (body.rwaId === undefined && !body.symbol) {
          return fail(res, 400, "bad_body", "provide symbol or rwaId");
        }
        if (body.rwaId !== undefined && !Number.isInteger(body.rwaId)) {
          return fail(res, 400, "bad_body", "rwaId must be an integer");
        }
        if (body.thresholds) {
          for (const [k, v] of Object.entries(body.thresholds)) {
            if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
              return fail(res, 400, "bad_body", `threshold ${k} must be a number in [0,100]`);
            }
          }
        }
        const entry = await runtime.addToWatchlist({
          ...(body.symbol ? { symbol: body.symbol } : {}),
          ...(body.rwaId !== undefined ? { rwaId: body.rwaId } : {}),
          thresholds: (body.thresholds as Thresholds | undefined) ?? null,
        });
        json(res, 201, { entry });
      } catch (err) {
        if (err instanceof BodyError) return bodyFail(res, err);
        fail(res, 400, "watchlist_error", err instanceof Error ? err.message : String(err));
      }
    }),

    route("DELETE", "/api/v1/watchlist/:rwaId", (req, res, p) => {
      if (!guardMutation(req, res)) return;
      const rwaId = Number(p["rwaId"]);
      if (!Number.isInteger(rwaId)) return fail(res, 400, "bad_id", "rwaId must be an integer");
      const removed = runtime.removeFromWatchlist(rwaId);
      if (!removed) return fail(res, 404, "not_found", "asset not on watchlist");
      json(res, 200, { removed: true, rwaId });
    }),

    route("GET", "/api/v1/alerts", (req, res) => {
      const limit = boundedInt(query(req).get("limit"), 1, 500, 50);
      json(res, 200, {
        configured: runtime.alerts.configured,
        minSeverity: config.alerts.minSeverity,
        destinations: runtime.alerts.destinationLabels,
        alerts: runtime.listAlertLog(limit),
      });
    }),

    route("GET", "/api/v1/scans", (_r, res) => {
      json(res, 200, {
        scans: instance.runtime.store.listScans(20),
        latest: instance.runtime.store.latestScan(),
      });
    }),

    route("GET", "/api/v1/diagnostics", (_r, res) => {
      json(res, 200, {
        dataMode: config.dataMode,
        capabilities: runtime.capabilities(),
        recent: instance.runtime.store.listDiagnostics(50),
        inMemory: diagnostics.entries.slice(-50),
      });
    }),

    route("POST", "/api/v1/scan", async (req, res) => {
      if (!guardMutation(req, res)) return;
      try {
        const out = await runtime.scan();
        json(res, 200, { scan: out.scan, snapshots: out.snapshots.length, events: out.events.length });
      } catch (err) {
        const e =
          err instanceof CmcError
            ? { kind: err.kind, message: err.message }
            : { kind: "internal", message: String(err) };
        json(res, 502, { error: e });
      }
    }),

    route("GET", "/api/v1/stream", (req, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ dataMode: config.dataMode })}\n\n`);
      const onSignal = (e: unknown) => {
        const ev = e as { type: string };
        res.write(`event: ${ev.type}\ndata: ${JSON.stringify(e)}\n\n`);
      };
      instance.bus.on("signal", onSignal);
      const keep = setInterval(() => res.write(": keepalive\n\n"), 25_000);
      req.on("close", () => {
        clearInterval(keep);
        instance.bus.off("signal", onSignal);
      });
    }),
  ];
}

/** Minimal router dispatcher. */
export function createApiHandler(instance: RuntimeInstance) {
  const routes = apiRoutes(instance);
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "", "http://x");
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec(url.pathname);
      if (!m) continue;
      const params: Params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      try {
        await r.handler(req, res, params);
      } catch (err) {
        if (!res.headersSent) {
          if (err instanceof BodyError) {
            bodyFail(res, err);
            return true;
          }
          fail(res, 500, "internal", err instanceof Error ? err.message : String(err));
        }
      }
      return true;
    }
    return false;
  };
}

// severity set retained for query validation of future filters
void VALID_SEVERITIES;
