import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createRuntime } from "@mirrorgap/runtime";
import { createApiHandler } from "../src/api.js";

const inst = createRuntime({
  env: {
    MIRRORGAP_DATA_MODE: "fixture",
    MIRRORGAP_CONFIRM_SCANS: "1",
    MIRRORGAP_FIXTURE_SCENARIO: "incident_cycle",
  } as NodeJS.ProcessEnv,
  dataMode: "fixture",
  dbPath: ":memory:",
});

const handler = createApiHandler(inst);
const server = createServer(async (req, res) => {
  if (!(await handler(req, res))) {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const get = async (p: string) => (await fetch(base + p)).json() as Promise<Record<string, any>>;
const getRaw = async (p: string) => fetch(base + p);
const post = async (p: string, body?: unknown) =>
  (
    await fetch(base + p, {
      method: "POST",
      ...(body !== undefined
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    })
  ).json() as Promise<Record<string, any>>;
const del = async (p: string) =>
  (await fetch(base + p, { method: "DELETE" })).json() as Promise<Record<string, any>>;

// One scan up-front so every test sees populated state.
await post("/api/v1/scan");
await post("/api/v1/scan");

describe("HTTP API (fixture)", () => {
  it("workbench exposes bounded evidence and validates underlying quotes", async () => {
    const r = await get("/api/v1/assets/2/workbench");
    expect(r.schema).toBe("mirrorgap.workbench.v1");
    expect(r.dataMode).toBe("fixture");
    expect(r.agentPolicy.mayExecuteTrade).toBe(false);
    expect(r.evidence.length).toBeGreaterThan(0);
    expect((await getRaw("/api/v1/assets/no/workbench")).status).toBe(400);
    expect((await getRaw("/api/v1/assets/99999/workbench")).status).toBe(404);
    expect((await post("/api/v1/assets/2/compare", { price: 12 })).error.code).toBe("bad_quote");
    const compared = await post("/api/v1/assets/2/compare", {
      rwaId: 2,
      price: 100,
      currency: "USD",
      unit: "share",
      observedAt: new Date().toISOString(),
      source: "Test input",
      sourceUrl: "https://example.com/quote",
      dataMode: "live",
      mappings: r.wrappers.map((w: { cryptoId: number }) => ({
        cryptoId: w.cryptoId,
        underlyingUnitsPerToken: 1,
      })),
    });
    expect(
      compared.underlying.comparisons.every((c: { reasons: string[] }) =>
        c.reasons.includes("data_mode_mismatch"),
      ),
    ).toBe(true);
    expect((await post("/api/v1/receipts/audit", {})).ok).toBe(false);
  });
  it("health reports mode + capabilities", async () => {
    const h = await get("/api/v1/health");
    expect(h.status).toBe("ok");
    expect(h.dataMode).toBe("fixture");
    expect(h.capabilities.marketPairs).toBe("no");
  });

  it("healthz + readyz respond for probes", async () => {
    expect((await get("/api/v1/healthz")).ok).toBe(true);
    const ready = await get("/api/v1/readyz");
    expect(ready.ok).toBe(true);
    expect(ready.dataMode).toBe("fixture");
  });

  it("scan → radar → events → receipt verify over HTTP", async () => {
    const scan = await post("/api/v1/scan");
    expect(scan.scan.status).toBe("completed");
    expect(scan.snapshots).toBeGreaterThan(3);

    const radar = await get("/api/v1/radar");
    expect(radar.assets.length).toBe(scan.snapshots);
    expect(radar.dataMode).toBe("fixture");

    const events = await get("/api/v1/events");
    expect(events.events.length).toBeGreaterThan(0);
    const id = events.events[0].eventId;

    const detail = await get(`/api/v1/events/${id}`);
    expect(detail.event.eventId).toBe(id);
    expect(detail.investigation.claims.length).toBeGreaterThan(0);
    expect(detail.timeline.length).toBeGreaterThan(0);

    const verify = await get(`/api/v1/receipts/${id}/verify`);
    expect(verify.ok).toBe(true);
    expect(verify.hashOk).toBe(true);
  });

  it("asset detail + search + effective thresholds", async () => {
    const found = await get("/api/v1/assets?q=nvda");
    expect(found.assets[0].symbol).toBe("NVDA");
    const detail = await get(`/api/v1/assets/${found.assets[0].rwaId}`);
    expect(detail.snapshot.gaps.length).toBeGreaterThan(0);
    expect(detail.representations.length).toBe(2);
    // thresholds fall back to global config when no watchlist override exists
    expect(detail.thresholds.info).toBeTypeOf("number");
    expect(detail.thresholds.critical).toBeTypeOf("number");
  });

  it("history endpoint: windows, bounds, stats", async () => {
    const h = await get("/api/v1/assets/2/history?window=all&maxPoints=64");
    expect(h.points.length).toBeGreaterThan(0);
    expect(h.points.length).toBeLessThanOrEqual(64);
    expect(h.stats.peakAbsGapPct).toBeTypeOf("number");
    expect(h.stats.anomalousShare).toBeGreaterThanOrEqual(0);
    const pt = h.points[0];
    expect(pt).toHaveProperty("maxSignedGapPct");
    expect(pt).toHaveProperty("aggregateFreshness");
    expect(pt).toHaveProperty("underlyingMarket");

    for (const w of ["1h", "6h", "24h", "7d", "all"]) {
      const r = await get(`/api/v1/assets/2/history?window=${w}`);
      expect(r.error, `window ${w}`).toBeUndefined();
    }
  });

  it("rejects invalid history window and bad ids", async () => {
    const bad = await get("/api/v1/assets/2/history?window=fortnight");
    expect(bad.error.code).toBe("bad_window");
    const badId = await get("/api/v1/assets/notanumber/history");
    expect(badId.error.code).toBe("bad_id");
    const missing = await get("/api/v1/assets/99999");
    expect(missing.error.code).toBe("not_found");
  });

  it("timeline endpoint replays a real incident", async () => {
    const events = await get("/api/v1/events");
    const id = events.events[0].eventId;
    const tl = await get(`/api/v1/events/${id}/timeline`);
    expect(tl.entries.length).toBeGreaterThan(0);
    const types = new Set<string>(tl.entries.map((e: any) => e.type as string));
    expect([...types].some((t) => t.includes("created") || t === "confirmed")).toBe(true);
    const framed = tl.entries.find((e: any) => e.frame);
    expect(framed.frame).toHaveProperty("referenceState");
    expect(framed.frame).toHaveProperty("underlyingMarket");
  });

  it("capsule bundles receipt + verification + human context", async () => {
    const events = await get("/api/v1/events");
    const confirmed = events.events.find((e: any) => e.status === "confirmed") ?? events.events[0];
    const cap = await get(`/api/v1/capsules/${confirmed.eventId}`);
    if (!cap.error) {
      expect(cap.receipt.receiptHash).toMatch(/^sha256:/);
      expect(cap.integrity.verification.ok).toBe(true);
      expect(cap.claimSummary).toHaveProperty("observed");
      expect(cap.dataMode).toBe("fixture");
    }
  });

  it("POST verify: untampered passes, tampered fails", async () => {
    const events = await get("/api/v1/events");
    const id = events.events[0].eventId;
    const receipt = await get(`/api/v1/receipts/${id}`);
    const good = await post("/api/v1/receipts/verify", receipt);
    expect(good.ok).toBe(true);
    const bad = await post("/api/v1/receipts/verify", {
      ...receipt,
      asset: { ...receipt.asset, symbol: "HACKED" },
    });
    expect(bad.ok).toBe(false);
    expect(bad.hashOk).toBe(false);
    expect(bad.errors[0]).toContain("hash mismatch");
    const garbage = await post("/api/v1/receipts/verify", { hello: "world" });
    expect(garbage.ok).toBe(false);
    expect(garbage.schemaOk).toBe(false);
  });

  it("watchlist add → list → remove round-trip", async () => {
    const add = await post("/api/v1/watchlist", { symbol: "NVDA" });
    expect(add.entry.symbol).toBe("NVDA");
    const list = await get("/api/v1/watchlist");
    expect(list.watchlist.map((w: any) => w.symbol)).toContain("NVDA");
    const rm = await del("/api/v1/watchlist/2");
    expect(rm.removed).toBe(true);
    const rm2 = await del("/api/v1/watchlist/2");
    expect(rm2.error.code).toBe("not_found");
  });

  it("watchlist validates thresholds", async () => {
    const bad = await post("/api/v1/watchlist", {
      symbol: "NVDA",
      thresholds: { info: -1, watch: 0, high: 0, critical: 0 },
    });
    expect(bad.error).toBeDefined();
  });

  it("overview aggregates counters", async () => {
    const ov = await get("/api/v1/overview");
    expect(ov.assetsWatched).toBeGreaterThan(0);
    expect(ov.storage.snapshots).toBeGreaterThan(0);
    expect(ov.eventCounts).toBeTypeOf("object");
    expect(ov.dataMode).toBe("fixture");
  });

  it("diagnostics + scans + alerts respond without secrets", async () => {
    const diag = await get("/api/v1/diagnostics");
    expect(diag.dataMode).toBe("fixture");
    expect(diag).toHaveProperty("capabilities");
    const scans = await get("/api/v1/scans");
    expect(scans.scans.length).toBeGreaterThan(0);
    const alerts = await get("/api/v1/alerts");
    expect(alerts).toHaveProperty("destinations");
    expect(alerts).toHaveProperty("alerts");
    // no destination URLs or tokens may appear anywhere
    expect(JSON.stringify(alerts)).not.toContain("http");
  });

  it("verification-key never leaks a private key", async () => {
    const k = await get("/api/v1/verification-key");
    expect(k).toHaveProperty("signing");
    expect(JSON.stringify(k)).not.toContain("pkcs8");
    expect(JSON.stringify(k)).not.toContain("PRIVATE");
  });

  it("events filter validates status", async () => {
    const bad = await get("/api/v1/events?status=bogus");
    expect(bad.error.code).toBe("bad_status");
    const ok = await get("/api/v1/events?status=confirmed");
    expect(ok.error).toBeUndefined();
  });

  it("oversized JSON bodies are rejected", async () => {
    const big = "x".repeat(70 * 1024);
    const r = await fetch(base + "/api/v1/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"symbol":"${big}"}`,
    });
    const body = (await r.json()) as Record<string, any>;
    expect(r.status).toBe(413);
    expect(body.error.code).toBe("payload_too_large");
  });

  it("malformed JSON body → structured error, not a crash", async () => {
    const r = await fetch(base + "/api/v1/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const body = (await r.json()) as Record<string, any>;
    expect(r.status).toBe(400);
    expect(body.error.code).toBe("bad_json");
  });

  it("rate limits mutations per IP", async () => {
    // Other tests already consumed a few mutation slots; push past the 30/min cap.
    let last: Response | null = null;
    for (let i = 0; i < 40 && last?.status !== 429; i++) {
      last = await fetch(base + "/api/v1/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
    }
    expect(last?.status).toBe(429);
    const body = (await last!.json()) as Record<string, any>;
    expect(body.error.code).toBe("rate_limited");
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });

  it("404s cleanly for unknown events + capsules", async () => {
    const d = await get("/api/v1/events/NOPE");
    expect(d.error).toBeDefined();
    const c = await get("/api/v1/capsules/MG-99999999-0000");
    expect(c.error.code).toBe("not_found");
  });
});
