import { describe, expect, it } from "vitest";
import { createRuntime } from "@mirrorgap/runtime";
import { buildTools } from "../src/tools.js";

const inst = createRuntime({
  env: { MIRRORGAP_DATA_MODE: "fixture", MIRRORGAP_CONFIRM_SCANS: "1" } as NodeJS.ProcessEnv,
  dataMode: "fixture",
  dbPath: ":memory:",
});
const tools = buildTools(inst);
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const t = tools.find((x) => x.name === name);
  expect(t, `tool ${name}`).toBeDefined();
  return t!.handler(args) as Promise<Record<string, unknown>>;
};

describe("MCP tools (fixture)", () => {
  it("workbench and offline audit are available to agents with explicit limits", async () => {
    await call("mirrorgap_scan");
    const r = await call("mirrorgap_workbench", { rwaId: 2 });
    expect(r["dataMode"]).toBe("fixture");
    expect((r["agentPolicy"] as { mayExecuteTrade: boolean }).mayExecuteTrade).toBe(false);
    await expect(call("mirrorgap_workbench", { rwaId: -1 })).rejects.toThrow();
    expect((await call("mirrorgap_audit_receipt", { receipt: {} }))["ok"]).toBe(false);
  });
  it("exposes domain tools beyond price lookups", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("mirrorgap_scan");
    expect(names).toContain("mirrorgap_inspect_asset");
    expect(names).toContain("mirrorgap_verify_receipt");
    expect(names).toContain("mirrorgap_cmc_status");
  });

  it("scan + radar + inspect + receipt verification flow", async () => {
    const scan = await call("mirrorgap_scan");
    expect(scan["assetsScanned"]).toBeGreaterThan(3);

    const radar = await call("mirrorgap_radar");
    expect((radar["assets"] as unknown[]).length).toBeGreaterThan(3);

    const inspect = await call("mirrorgap_inspect_asset", { asset: "NVDA" });
    expect((inspect["asset"] as { symbol: string }).symbol).toBe("NVDA");
    expect(inspect["snapshot"]).toBeTruthy();

    const events = (await call("mirrorgap_list_events"))["events"] as { eventId: string }[];
    expect(events.length).toBeGreaterThan(0);

    const detail = await call("mirrorgap_get_event", { eventId: events[0]!.eventId });
    expect(detail["event"]).toBeTruthy();

    const verify = await call("mirrorgap_verify_receipt", { eventId: events[0]!.eventId });
    expect(verify["ok"]).toBe(true);

    const status = await call("mirrorgap_cmc_status");
    expect(status["dataMode"]).toBe("fixture");
  });

  it("history returns bounded series + stats", async () => {
    await call("mirrorgap_scan");
    const h = await call("mirrorgap_history", { asset: "NVDA", window: "all" });
    expect(Array.isArray(h["points"])).toBe(true);
    expect((h["points"] as unknown[]).length).toBeGreaterThan(0);
    expect(h["stats"]).toBeTruthy();
    const bad = await call("mirrorgap_history", { asset: "NOPE" });
    expect(String(bad["error"])).toContain("unknown asset");
  });

  it("timeline + capsule expose the incident arc", async () => {
    await call("mirrorgap_scan");
    const events = (await call("mirrorgap_list_events"))["events"] as { eventId: string }[];
    const id = events[0]!.eventId;
    const tl = await call("mirrorgap_timeline", { eventId: id });
    expect((tl["entries"] as unknown[]).length).toBeGreaterThan(0);
    const cap = await call("mirrorgap_capsule", { eventId: id });
    expect(cap["receipt"]).toBeTruthy();
    expect((cap["integrity"] as { verification: { ok: boolean } }).verification.ok).toBe(true);
    const missing = await call("mirrorgap_capsule", { eventId: "MG-99999999-0000" });
    expect(String(missing["error"])).toContain("capsule");
  });

  it("watchlist add/list/remove round-trip + malformed input", async () => {
    const add = await call("mirrorgap_watchlist", { action: "add", asset: "NVDA" });
    expect((add["added"] as { symbol: string }).symbol).toBe("NVDA");
    const list = await call("mirrorgap_watchlist", { action: "list" });
    expect((list["watchlist"] as unknown[]).length).toBe(1);
    const rm = await call("mirrorgap_watchlist", { action: "remove", asset: "NVDA" });
    expect(rm["removed"] as string).toBe("NVDA");
    const rmAgain = await call("mirrorgap_watchlist", { action: "remove", asset: "NVDA" });
    expect(String(rmAgain["error"])).toContain("not on watchlist");
    const badAction = await call("mirrorgap_watchlist", { action: "explode" });
    expect(String(badAction["error"])).toContain("unknown action");
  });

  it("overview reports storage + event counters", async () => {
    await call("mirrorgap_scan");
    const ov = await call("mirrorgap_overview");
    expect(ov["assetsWatched"]).toBeGreaterThan(3);
    expect(ov["storage"]).toBeTruthy();
    expect((ov["storage"] as { snapshots: number }).snapshots).toBeGreaterThan(0);
  });

  it("malformed calls never throw — structured errors instead", async () => {
    for (const [name, args] of [
      ["mirrorgap_inspect_asset", {}],
      ["mirrorgap_get_event", { eventId: 42 }],
      ["mirrorgap_timeline", { eventId: null }],
      ["mirrorgap_history", { asset: "" }],
      ["mirrorgap_watchlist", { action: "add" }],
    ] as const) {
      const t = tools.find((x) => x.name === name)!;
      const out = (await t.handler(args as Record<string, unknown>)) as Record<string, unknown>;
      expect(out, `${name} should return an object`).toBeTypeOf("object");
    }
  });
});
