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
});
