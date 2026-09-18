import { describe, expect, it } from "vitest";
import { measureDispersion } from "../src/dispersion.js";
import { tokObs } from "./helpers.js";

describe("dispersion_v1", () => {
  it("computes dispersion across multiple wrappers", () => {
    const d = measureDispersion([tokObs(1, "A", 100), tokObs(2, "B", 102), tokObs(3, "C", 101)], "USD");
    expect(d.wrapperCount).toBe(3);
    expect(d.minPrice).toBe(100);
    expect(d.maxPrice).toBe(102);
    expect(d.medianPrice).toBe(101);
    expect(d.dispersionPct).toBeCloseTo((2 / 101) * 100, 5);
    expect(d.maxPositiveDeviationPct).toBeCloseTo((1 / 101) * 100, 5);
    expect(d.maxNegativeDeviationPct).toBeCloseTo((-1 / 101) * 100, 5);
  });

  it("reports null dispersion for a single wrapper (cannot compute)", () => {
    const d = measureDispersion([tokObs(1, "A", 100)], "USD");
    expect(d.wrapperCount).toBe(1);
    expect(d.dispersionPct).toBeNull();
    expect(d.minPrice).toBe(100);
  });

  it("reports nulls when no valid tokens exist", () => {
    const d = measureDispersion([], "USD");
    expect(d.wrapperCount).toBe(0);
    expect(d.dispersionPct).toBeNull();
    expect(d.minPrice).toBeNull();
  });

  it("excludes invalid prices and wrong currencies from the calculation", () => {
    const d = measureDispersion(
      [
        tokObs(1, "A", 100),
        tokObs(2, "BAD", 0),
        tokObs(3, "EUR1", 200, { currency: "EUR" }),
        tokObs(4, "B", 104),
      ],
      "USD",
    );
    expect(d.wrapperCount).toBe(2);
    expect(d.maxPrice).toBe(104);
  });

  it("handles even-count median correctly", () => {
    const d = measureDispersion([tokObs(1, "A", 100), tokObs(2, "B", 110)], "USD");
    expect(d.medianPrice).toBe(105);
    expect(d.dispersionPct).toBeCloseTo((10 / 105) * 100, 5);
  });
});
