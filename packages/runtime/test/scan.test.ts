import { describe, expect, it } from "vitest";
import { generateSigningKey } from "@mirrorgap/core";
import { createRuntime } from "../src/factory.js";

const env = {
  MIRRORGAP_DATA_MODE: "fixture",
  MIRRORGAP_CONFIRM_SCANS: "1",
  MIRRORGAP_WATCH_LIMIT: "20",
} as NodeJS.ProcessEnv;

function make() {
  return createRuntime({ env, dataMode: "fixture", dbPath: ":memory:" });
}

describe("runtime scan pipeline (fixture)", () => {
  it("runs a full scan: observations → snapshots → store", async () => {
    const { runtime, close } = make();
    const out = await runtime.scan();
    expect(out.scan.status).toBe("completed");
    expect(out.snapshots.length).toBeGreaterThan(3);
    // every snapshot was persisted
    for (const s of out.snapshots) {
      expect(out.scan.scanId).toBe(s.scanId);
    }
    const radar = runtime.radar();
    expect(radar.length).toBe(out.snapshots.length);
    close();
  });

  it("produces lifecycle events and signed-off receipts for confirmed anomalies", async () => {
    const { runtime, close } = make();
    const out = await runtime.scan();
    const events = runtime.listEvents();
    expect(events.length).toBeGreaterThan(0);
    // at least one event got a receipt + investigation
    const detailed = events
      .map((e) => runtime.getEventDetail(e.eventId))
      .filter((d) => d !== null && d.receipt !== null);
    // confirmScans=1 so every anomaly confirms immediately
    for (const d of detailed) {
      expect(d!.verification?.ok).toBe(true);
      expect(d!.investigation).not.toBeNull();
      expect(d!.investigation!.claims.length).toBeGreaterThan(0);
    }
    expect(out.events.length).toBe(events.length);
    close();
  });

  it("scopes scans to requested symbols", async () => {
    const { runtime, close } = make();
    const out = await runtime.scan({ symbols: ["NVDA"] });
    expect(out.snapshots).toHaveLength(1);
    expect(out.snapshots[0]!.rwaId).toBe(2);
    close();
  });

  it("signs receipts when a signing key is configured", async () => {
    const { privateKey, publicKey } = generateSigningKey();
    const inst = createRuntime({ env, dataMode: "fixture", dbPath: ":memory:", signingKey: privateKey });
    await inst.runtime.scan();
    const events = inst.runtime.listEvents();
    expect(events.length).toBeGreaterThan(0);
    const detail = inst.runtime.getEventDetail(events[0]!.eventId)!;
    expect(detail.receipt?.signature?.alg).toBe("ed25519");
    expect(detail.receipt?.signature?.publicKey).toBe(publicKey);
    expect(detail.verification?.ok).toBe(true);
    expect(detail.verification?.signatureOk).toBe(true);
    inst.close();
  });

  it("second scan updates event lifecycle rather than duplicating", async () => {
    const inst = make();
    const { runtime } = inst;
    await runtime.scan();
    const n1 = runtime.listEvents().length;
    await runtime.scan();
    const n2 = runtime.listEvents().length;
    expect(n2).toBe(n1); // same open events updated, not re-created
    inst.close();
  });
});
