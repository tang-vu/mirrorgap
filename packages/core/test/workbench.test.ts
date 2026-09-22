import { describe, expect, it } from "vitest";
import { buildWorkbench, UnderlyingQuoteSchema, type UnderlyingQuote } from "../src/workbench.js";
import { evaluateAsset } from "../src/engine.js";
import { NOW, asset, refObs, tokObs } from "./helpers.js";

function input() {
  const reference = refObs(100);
  const tokens = [tokObs(1, "A", 100), tokObs(2, "B", 101), tokObs(3, "C", 110)];
  const snapshot = evaluateAsset({
    asset: asset(),
    reference,
    tokens,
    now: NOW,
    scanId: "s",
    snapshotId: "s:2",
    priorConfirmations: 1,
    marketPairsAvailable: false,
    thresholds: { info: 0.25, watch: 0.5, high: 1, critical: 2 },
    freshness: { freshSeconds: 120, agingSeconds: 600 },
  }).snapshot;
  return {
    asset: asset(),
    snapshot,
    observations: [reference, ...tokens],
    representations: [],
    dataMode: "fixture" as const,
    now: NOW,
    maxAgeSeconds: 600,
  };
}
function quote(): UnderlyingQuote {
  return {
    rwaId: 2,
    price: 50,
    currency: "USD",
    unit: "share",
    observedAt: NOW.toISOString(),
    source: "Synthetic analyst example",
    sourceUrl: "https://example.com/quote",
    dataMode: "fixture",
    mappings: [
      { cryptoId: 1, underlyingUnitsPerToken: 2 },
      { cryptoId: 2, underlyingUnitsPerToken: 2 },
      { cryptoId: 3, underlyingUnitsPerToken: 2 },
    ],
  };
}

describe("investigation workbench", () => {
  it("excludes the subject from peer median and preserves CMC evidence", () => {
    const result = buildWorkbench(input());
    expect(result.wrappers[0]).toMatchObject({ symbol: "C", peerMedian: 100.5, peerCount: 2 });
    expect(result.wrappers[0]!.peerGapPct).toBeCloseTo(9.452736, 6);
    expect(result.agentPolicy.mayAssertUnderlyingParity).toBe(false);
    expect(result.reportHash).toBe(buildWorkbench(input()).reportHash);
    expect(result.evidence).toHaveLength(4);
  });
  it("does not attribute blame with only two wrappers", () => {
    const i = input();
    i.observations.pop();
    i.snapshot.observationIds.pop();
    expect(buildWorkbench(i).wrappers.every((w) => w.peerAgreement === "insufficient_peers")).toBe(true);
  });
  it("blocks stale, future and pruned snapshots", () => {
    for (const offset of [601000, -1000]) {
      const r = buildWorkbench({ ...input(), now: new Date(NOW.getTime() + offset) });
      expect(r.disposition).toBe("refresh_evidence");
      expect(r.agentPolicy.maySummarizeEvidence).toBe(false);
    }
    expect(buildWorkbench({ ...input(), observations: [] }).blockers.length).toBeGreaterThan(0);
  });
  it("compares explicit unit ratios, with analyst attribution and unknown token timestamps", () => {
    const r = buildWorkbench({ ...input(), underlying: quote() });
    const c = r.underlying!.comparisons.find((v) => v.cryptoId === 1)!;
    expect(c).toMatchObject({ status: "indicative", expectedTokenPrice: 100, gapPct: 0 });
    expect(c.limitations.join(" ")).toContain("simultaneity");
    expect(r.underlying!.attribution).toContain("not_authenticated");
  });
  it("blocks incompatible asset, currency, mode, missing ratio and stale underlying", () => {
    for (const override of [
      { rwaId: 99 },
      { currency: "EUR" },
      { dataMode: "live" as const },
      { mappings: [{ cryptoId: 999, underlyingUnitsPerToken: 1 }] },
      { observedAt: "2020-01-01T00:00:00.000Z" },
    ]) {
      const r = buildWorkbench({ ...input(), underlying: { ...quote(), ...override } });
      expect(r.underlying!.comparisons.every((c) => c.status === "blocked" && c.gapPct === null)).toBe(true);
    }
  });
  it("does not compare underlying prices outside an open/continuous market", () => {
    const i = input();
    i.snapshot.reference.underlyingMarket = "closed";
    expect(buildWorkbench({ ...i, underlying: quote() }).underlying!.comparisons[0]!.reasons).toContain(
      "underlying_market_not_open",
    );
  });
  it("rejects duplicate mappings, secrets in URLs and nonpositive unit ratios", () => {
    const q = quote();
    expect(UnderlyingQuoteSchema.safeParse({ ...q, mappings: [q.mappings[0], q.mappings[0]] }).success).toBe(
      false,
    );
    expect(
      UnderlyingQuoteSchema.safeParse({ ...q, sourceUrl: "https://example.com/?key=secret" }).success,
    ).toBe(false);
    expect(
      UnderlyingQuoteSchema.safeParse({ ...q, mappings: [{ cryptoId: 1, underlyingUnitsPerToken: 0 }] })
        .success,
    ).toBe(false);
  });
});
