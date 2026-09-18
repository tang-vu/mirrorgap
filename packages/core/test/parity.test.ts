import { describe, expect, it } from "vitest";
import { measureGap, measureGaps } from "../src/parity.js";
import { NOW, refObs, tokObs } from "./helpers.js";

describe("parity_gap_v1", () => {
  it("computes positive and negative gaps", () => {
    const ref = refObs(100);
    expect(measureGap(tokObs(1, "A", 101), ref)?.gapPct).toBeCloseTo(1, 5);
    expect(measureGap(tokObs(2, "B", 98.5), ref)?.gapPct).toBeCloseTo(-1.5, 5);
  });

  it("rejects currency mismatch instead of fabricating a comparison", () => {
    const ref = refObs(100);
    const t = tokObs(1, "A", 101, { currency: "EUR" });
    expect(measureGap(t, ref)).toBeNull();
    const report = measureGaps([t], ref);
    expect(report.gaps).toHaveLength(0);
    expect(report.skipped[0]?.reason).toMatch(/currency mismatch/);
  });

  it("rejects zero/negative/invalid prices", () => {
    const ref = refObs(100);
    expect(measureGap(tokObs(1, "A", 0), ref)).toBeNull();
    expect(measureGap(tokObs(1, "A", -5), ref)).toBeNull();
    expect(measureGap(tokObs(1, "A", Number.NaN), ref)).toBeNull();
    const zeroRef = refObs(0);
    expect(measureGap(tokObs(1, "A", 100), zeroRef)).toBeNull();
  });

  it("flags retrieval-sourced timestamps as a limitation", () => {
    const g = measureGap(tokObs(1, "A", 101, { timestampSource: "retrieval" }), refObs(100));
    expect(g?.limitations.join(" ")).toMatch(/no upstream timestamp/);
  });

  it("handles missing reference by skipping every token", () => {
    const report = measureGaps([tokObs(1, "A", 1)], null);
    expect(report.gaps).toHaveLength(0);
    expect(report.skipped[0]?.reason).toBe("no reference observation");
  });

  it("is deterministic: identical inputs → identical output", () => {
    const a = measureGap(tokObs(1, "A", 226.5), refObs(226.46));
    const b = measureGap(tokObs(1, "A", 226.5), refObs(226.46));
    expect(a).toEqual(b);
  });
});
