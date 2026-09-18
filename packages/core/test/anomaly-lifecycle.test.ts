import { describe, expect, it } from "vitest";
import { detectAnomaly, severityFor } from "../src/anomaly.js";
import { applyScanToEvent } from "../src/lifecycle.js";
import { evaluateAsset } from "../src/engine.js";
import type { Thresholds } from "../src/config.js";
import { NOW, asset, refObs, tokObs } from "./helpers.js";

const T: Thresholds = { info: 0.25, watch: 0.5, high: 1.0, critical: 2.0 };
const FRESH = { freshSeconds: 120, agingSeconds: 600 };

describe("severityFor", () => {
  it("maps deviations to bands", () => {
    expect(severityFor(0.1, T)).toBe("none");
    expect(severityFor(0.25, T)).toBe("info");
    expect(severityFor(0.6, T)).toBe("watch");
    expect(severityFor(1.5, T)).toBe("high");
    expect(severityFor(2.5, T)).toBe("critical");
  });
});

function evalAsset(
  tokens: import("../src/domain/observations.js").TokenObservation[],
  ref: import("../src/domain/observations.js").ReferenceObservation | null = refObs(226.46),
  now = NOW,
  prior = 0,
) {
  return evaluateAsset({
    scanId: "scan_1",
    snapshotId: "snap_1",
    asset: asset(),
    reference: ref,
    tokens,
    thresholds: T,
    freshness: FRESH,
    marketPairsAvailable: null,
    priorConfirmations: prior,
    now,
  });
}

describe("detectAnomaly", () => {
  it("detects a parity gap above threshold", () => {
    // Both wrappers deviate from the aggregate in the same direction with
    // near-zero mutual dispersion → parity_gap is the dominant signal.
    const { snapshot, anomaly } = evalAsset([
      tokObs(1, "NVDAX", 228.9),
      tokObs(2, "NVDAon", 229.0), // ≈ +1.1% vs 226.46
    ]);
    expect(snapshot.severity).toBe("high");
    expect(anomaly?.kind).toBe("parity_gap");
    expect(anomaly?.classification).toBe("parity_gap");
    expect(anomaly?.driver).toBe("NVDAon");
  });

  it("reports the dominant signal when gap and dispersion both fire", () => {
    const { anomaly } = evalAsset([
      tokObs(1, "NVDAX", 226.33),
      tokObs(2, "NVDAon", 230.4), // +1.74% vs 226.46; dispersion ≈1.8%
    ]);
    expect(anomaly?.kind).toBe("cross_wrapper_dispersion");
    expect(anomaly?.severity).toBe("high");
  });

  it("detects cross-wrapper dispersion even when reference gaps are small", () => {
    const { anomaly } = evalAsset(
      [tokObs(1, "A", 100.1, { price: 100.1 }), tokObs(2, "B", 102.2)],
      refObs(101.15),
    );
    // dispersion ≈ (2.1/101.15)*100 ≈ 2.08% → critical
    expect(anomaly?.kind).toBe("cross_wrapper_dispersion");
    expect(anomaly?.severity).toBe("critical");
  });

  it("classifies as price_difference when the underlying market is closed", () => {
    const saturday = new Date("2026-09-19T15:00:00.000Z");
    const { anomaly } = evalAsset(
      [tokObs(1, "NVDAX", 226.33), tokObs(2, "NVDAon", 230.4)],
      refObs(226.46, { observedAt: saturday.toISOString() }),
      saturday,
    );
    expect(anomaly).not.toBeNull();
    expect(anomaly?.classification).toBe("price_difference");
  });

  it("returns null when reference is unavailable or incomparable", () => {
    const noRef = evalAsset([tokObs(1, "A", 100)], null);
    expect(noRef.anomaly).toBeNull();
    const mismatch = evalAsset([tokObs(1, "A", 100, { currency: "EUR" })], refObs(100));
    expect(mismatch.anomaly).toBeNull();
  });

  it("does not flag small deviations", () => {
    const { anomaly } = evalAsset([tokObs(1, "A", 226.5), tokObs(2, "B", 226.6)]);
    expect(anomaly).toBeNull();
  });
});

describe("event lifecycle", () => {
  const mkSnapshot = (sev: "none" | "high" = "high") => {
    const { snapshot } = evalAsset([tokObs(1, "A", 226.3), tokObs(2, "B", 230.4)]);
    return { ...snapshot, severity: sev };
  };
  const opts = (n = 0) => ({
    confirmScans: 2,
    now: new Date(NOW.getTime() + n * 60_000),
    eventIdFactory: () => "evt_test_1",
    assetSymbol: "NVDA",
    dataMode: "fixture" as const,
  });

  it("creates a candidate on first anomaly scan", () => {
    const snap = mkSnapshot();
    const anomaly = {
      kind: "parity_gap" as const,
      classification: "parity_gap" as const,
      severity: "high" as const,
      deviationPct: 1.74,
      driver: "B",
    };
    const r = applyScanToEvent(null, snap, anomaly, opts());
    expect(r?.transition).toBe("created");
    expect(r?.event.status).toBe("candidate");
    expect(r?.event.confirmations).toBe(1);
  });

  it("confirms after configured scans", () => {
    const snap = mkSnapshot();
    const anomaly = {
      kind: "parity_gap" as const,
      classification: "parity_gap" as const,
      severity: "high" as const,
      deviationPct: 1.74,
      driver: "B",
    };
    const r1 = applyScanToEvent(null, snap, anomaly, opts());
    const r2 = applyScanToEvent(r1!.event, snap, anomaly, opts(1));
    expect(r2?.event.status).toBe("confirmed");
    expect(r2?.event.confirmations).toBe(2);
    expect(r2?.transition).toBe("confirmed");
  });

  it("confirms immediately when confirmScans=1 (demo mode)", () => {
    const snap = mkSnapshot();
    const anomaly = {
      kind: "parity_gap" as const,
      classification: "parity_gap" as const,
      severity: "high" as const,
      deviationPct: 1.74,
      driver: "B",
    };
    const r = applyScanToEvent(null, snap, anomaly, { ...opts(), confirmScans: 1 });
    expect(r?.event.status).toBe("confirmed");
    expect(r?.transition).toBe("confirmed");
  });

  it("resolves when a later scan is below threshold", () => {
    const snap = mkSnapshot();
    const anomaly = {
      kind: "parity_gap" as const,
      classification: "parity_gap" as const,
      severity: "high" as const,
      deviationPct: 1.74,
      driver: "B",
    };
    const r1 = applyScanToEvent(null, snap, anomaly, { ...opts(), confirmScans: 1 });
    const clean = mkSnapshot("none");
    const r2 = applyScanToEvent(r1!.event, clean, null, opts(2));
    expect(r2?.event.status).toBe("resolved");
    expect(r2?.transition).toBe("resolved");
    expect(r2?.event.resolvedAt).not.toBeNull();
  });

  it("tracks max deviation across scans", () => {
    const snap = mkSnapshot();
    const a1 = {
      kind: "parity_gap" as const,
      classification: "parity_gap" as const,
      severity: "high" as const,
      deviationPct: 1.2,
      driver: "B",
    };
    const a2 = { ...a1, deviationPct: 1.9 };
    const r1 = applyScanToEvent(null, snap, a1, opts());
    const r2 = applyScanToEvent(r1!.event, snap, a2, opts(1));
    expect(r2?.event.maxDeviationPct).toBe(1.9);
    const r3 = applyScanToEvent(r2!.event, snap, a1, opts(2));
    expect(r3?.event.maxDeviationPct).toBe(1.9);
    expect(r3?.event.latestDeviationPct).toBe(1.2);
  });
});
