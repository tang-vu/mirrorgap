import { describe, expect, it } from "vitest";
import { SqliteStore } from "../src/sqlite.js";
import type { AnomalyEvent, IntegritySnapshot, ScanRun } from "@mirrorgap/core";

function scan(id: string): ScanRun {
  return {
    scanId: id,
    startedAt: new Date().toISOString(),
    completedAt: null,
    dataMode: "fixture",
    assetsScanned: 0,
    anomaliesFound: 0,
    status: "running",
    error: null,
  };
}

describe("SqliteStore", () => {
  it("migrates and round-trips assets", () => {
    const s = new SqliteStore(":memory:");
    s.upsertAsset({
      rwaId: 2,
      symbol: "NVDA",
      name: "Nvidia Corp",
      slug: "nvidia",
      assetType: "stock",
      rwaRank: 2,
      hasTokens: true,
      primaryExchange: "Nasdaq",
    });
    expect(s.getAsset(2)?.symbol).toBe("NVDA");
    expect(s.findAssetBySymbol("nvda")?.rwaId).toBe(2);
    expect(s.searchAssets("vid")).toHaveLength(1);
    s.close();
  });

  it("tracks event lifecycle rows", () => {
    const s = new SqliteStore(":memory:");
    const ev: AnomalyEvent = {
      eventId: "evt_1",
      rwaId: 2,
      assetSymbol: "NVDA",
      kind: "parity_gap",
      classification: "parity_gap",
      severity: "high",
      status: "candidate",
      firstSeenAt: "2026-09-18T15:00:00Z",
      lastSeenAt: "2026-09-18T15:00:00Z",
      confirmations: 1,
      maxDeviationPct: 1.7,
      latestDeviationPct: 1.7,
      latestSnapshotId: "s1",
      resolvedAt: null,
      dataMode: "fixture",
    };
    s.upsertEvent(ev);
    expect(s.openEventFor(2, "parity_gap")?.eventId).toBe("evt_1");
    s.upsertEvent({ ...ev, status: "resolved", resolvedAt: "2026-09-18T16:00:00Z" });
    expect(s.openEventFor(2, "parity_gap")).toBeNull();
    expect(s.getEvent("evt_1")?.status).toBe("resolved");
    s.close();
  });

  it("sequences event ids per date", () => {
    const s = new SqliteStore(":memory:");
    expect(s.nextEventSeq("20260918")).toBe(1);
    expect(s.nextEventSeq("20260918")).toBe(2);
    expect(s.nextEventSeq("20260919")).toBe(1);
    s.close();
  });

  it("records scans and diagnostics", () => {
    const s = new SqliteStore(":memory:");
    s.beginScan(scan("scan_1"));
    s.completeScan("scan_1", { status: "completed", assetsScanned: 7, anomaliesFound: 2 });
    expect(s.latestScan()?.status).toBe("completed");
    expect(s.latestScan()?.anomaliesFound).toBe(2);
    s.recordDiagnostic({
      at: new Date().toISOString(),
      endpoint: "/x",
      params: {},
      latencyMs: 5,
      httpStatus: 200,
      cmcErrorCode: 0,
      creditCount: 1,
      outcome: "ok",
    });
    expect(s.listDiagnostics()).toHaveLength(1);
    s.close();
  });
});
