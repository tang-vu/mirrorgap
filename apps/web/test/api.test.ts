import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createRuntime } from "@mirrorgap/runtime";
import { createApiHandler } from "../src/api.js";

const inst = createRuntime({
  env: { MIRRORGAP_DATA_MODE: "fixture", MIRRORGAP_CONFIRM_SCANS: "1" } as NodeJS.ProcessEnv,
  dataMode: "fixture",
  dbPath: ":memory:",
});

const server = createServer(async (req, res) => {
  if (!(await createApiHandler(inst)(req, res))) {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const get = async (p: string) => (await fetch(base + p)).json() as Promise<Record<string, any>>;
const post = async (p: string) =>
  (await fetch(base + p, { method: "POST" })).json() as Promise<Record<string, any>>;

describe("HTTP API (fixture)", () => {
  it("health reports mode + capabilities", async () => {
    const h = await get("/api/v1/health");
    expect(h.status).toBe("ok");
    expect(h.dataMode).toBe("fixture");
    expect(h.capabilities.marketPairs).toBe("no");
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

    const verify = await get(`/api/v1/receipts/${id}/verify`);
    expect(verify.ok).toBe(true);
    expect(verify.hashOk).toBe(true);
  });

  it("asset detail + search", async () => {
    await post("/api/v1/scan");
    const found = await get("/api/v1/assets?q=nvda");
    expect(found.assets[0].symbol).toBe("NVDA");
    const detail = await get(`/api/v1/assets/${found.assets[0].rwaId}`);
    expect(detail.snapshot.gaps.length).toBeGreaterThan(0);
    expect(detail.representations.length).toBe(2);
  });

  it("404s cleanly", async () => {
    const d = await get("/api/v1/events/NOPE");
    expect(d.error).toBeDefined();
  });
});
