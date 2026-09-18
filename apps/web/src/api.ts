import type { IncomingMessage, ServerResponse } from "node:http";
import type { RuntimeInstance } from "@mirrorgap/runtime";
import { CmcError } from "@mirrorgap/cmc";

type Params = Record<string, string>;
type Handler = (req: IncomingMessage, res: ServerResponse, params: Params) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

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

export function apiRoutes(instance: RuntimeInstance): Route[] {
  const { runtime, config, diagnostics } = instance;

  const guardScan = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (!config.scanToken) {
      // No token configured: restrict to loopback callers only.
      const ip = req.socket.remoteAddress ?? "";
      if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return true;
      json(res, 403, { error: "scan trigger restricted to localhost without MIRRORGAP_SCAN_TOKEN" });
      return false;
    }
    const tok = req.headers["x-scan-token"] ?? new URL(req.url ?? "", "http://x").searchParams.get("token");
    if (tok === config.scanToken) return true;
    json(res, 403, { error: "scan token required" });
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
        marketPairs: capabilities(instance),
        generatedAt: new Date().toISOString(),
        assets: rows,
      });
    }),

    route("GET", "/api/v1/assets", (req, res) => {
      const q = new URL(req.url ?? "", "http://x").searchParams.get("q") ?? "";
      const assets = q ? instance.runtime.store.searchAssets(q) : instance.runtime.store.listAssets();
      json(res, 200, { assets });
    }),

    route("GET", "/api/v1/assets/:rwaId", async (_r, res, p) => {
      const rwaId = Number(p["rwaId"]);
      const asset = instance.runtime.store.getAsset(rwaId);
      if (!asset) return json(res, 404, { error: "unknown rwa_id" });
      const snapshot = instance.runtime.store.latestSnapshot(rwaId);
      const reps = instance.runtime.store.listRepresentations(rwaId);
      const events = instance.runtime.store.listEvents({ limit: 50 }).filter((e) => e.rwaId === rwaId);
      json(res, 200, { asset, representations: reps, snapshot, events, dataMode: config.dataMode });
    }),

    route("GET", "/api/v1/events", (req, res) => {
      const status = new URL(req.url ?? "", "http://x").searchParams.get("status") ?? undefined;
      json(res, 200, { events: runtime.listEvents(status ? { status } : {}) });
    }),

    route("GET", "/api/v1/events/:eventId", async (req, res, p) => {
      const d = runtime.getEventDetail(p["eventId"]!);
      if (!d) return json(res, 404, { error: "unknown event" });
      const wantExplain = new URL(req.url ?? "", "http://x").searchParams.get("explain");
      const explanation = await runtime.explainEvent(p["eventId"]!, { llm: wantExplain === "llm" });
      json(res, 200, { ...d, explanation, dataMode: config.dataMode });
    }),

    route("GET", "/api/v1/receipts/:eventId", (_r, res, p) => {
      const receipt = instance.runtime.store.receiptForEvent(p["eventId"]!);
      if (!receipt) return json(res, 404, { error: "no receipt for event" });
      json(res, 200, receipt);
    }),

    route("GET", "/api/v1/receipts/:eventId/verify", (_r, res, p) => {
      const v = runtime.verifyEventReceipt(p["eventId"]!);
      if (!v) return json(res, 404, { error: "no receipt for event" });
      json(res, 200, v);
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
        capabilities: capabilities(instance),
        recent: instance.runtime.store.listDiagnostics(50),
        inMemory: diagnostics.entries.slice(-50),
      });
    }),

    route("POST", "/api/v1/scan", async (req, res) => {
      if (!guardScan(req, res)) return;
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

function capabilities(instance: RuntimeInstance): Record<string, string> {
  return instance.runtime.capabilities();
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
        json(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
    return false;
  };
}
