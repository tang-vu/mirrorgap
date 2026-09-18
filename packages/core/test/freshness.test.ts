import { describe, expect, it } from "vitest";
import { assessFreshness, buildReferenceContext } from "../src/freshness.js";
import {
  isUsRegularSessionOpen,
  nyseClosedDates,
  easterSunday,
  underlyingMarketState,
} from "../src/market-hours.js";
import { NOW, asset, refObs, tokObs } from "./helpers.js";

const W = { freshSeconds: 120, agingSeconds: 600 };

describe("freshness", () => {
  it("classifies fresh/aging/stale by age", () => {
    const at = NOW;
    expect(assessFreshness(new Date(at.getTime() - 30_000).toISOString(), at, W).state).toBe("fresh");
    expect(assessFreshness(new Date(at.getTime() - 300_000).toISOString(), at, W).state).toBe("aging");
    expect(assessFreshness(new Date(at.getTime() - 3_600_000).toISOString(), at, W).state).toBe("stale");
  });

  it("marks missing timestamps unavailable", () => {
    expect(assessFreshness(null, NOW, W).state).toBe("unavailable");
  });

  it("reports age seconds", () => {
    const f = assessFreshness(new Date(NOW.getTime() - 90_000).toISOString(), NOW, W);
    expect(f.ageSeconds).toBeCloseTo(90, 0);
  });
});

describe("reference context", () => {
  it("is fresh when aggregate is fresh and US market open", () => {
    const ctx = buildReferenceContext(asset(), refObs(226), NOW, W, { comparableTokens: 2 });
    expect(ctx.state).toBe("fresh");
    expect(ctx.underlyingMarket).toBe("open");
    expect(ctx.marketHoursHeuristic).toBe("us_regular_session_v1");
  });

  it("is market_closed for US stocks outside session even with fresh data", () => {
    const saturday = new Date("2026-09-19T15:00:00.000Z"); // Sat 11:00 ET
    const ctx = buildReferenceContext(asset(), refObs(226), saturday, W, { comparableTokens: 2 });
    expect(ctx.state).toBe("market_closed");
    expect(ctx.underlyingMarket).toBe("closed");
    expect(ctx.explanations.join(" ")).toMatch(/closed/);
  });

  it("does not guess hours for non-US/unknown venues", () => {
    const a = asset({ primaryExchange: null });
    const ctx = buildReferenceContext(a, refObs(226), NOW, W, { comparableTokens: 1 });
    expect(ctx.underlyingMarket).toBe("unknown");
    expect(ctx.state).toBe("fresh"); // aggregate still drives reference state
  });

  it("does not guess hours for commodities", () => {
    const gold = asset({ assetType: "commodity", symbol: "GOLD" });
    const ctx = buildReferenceContext(gold, refObs(4400), NOW, W, { comparableTokens: 2 });
    expect(ctx.underlyingMarket).toBe("unknown");
  });

  it("is incomparable when no tokens share the reference currency", () => {
    const ctx = buildReferenceContext(asset(), refObs(226), NOW, W, { comparableTokens: 0 });
    expect(ctx.state).toBe("incomparable");
  });

  it("is unavailable without a reference observation", () => {
    const ctx = buildReferenceContext(asset(), null, NOW, W, { comparableTokens: 0 });
    expect(ctx.state).toBe("unavailable");
  });

  it("marks stale aggregate references as stale", () => {
    const old = refObs(226, { observedAt: new Date(NOW.getTime() - 7200_000).toISOString() });
    const ctx = buildReferenceContext(asset({ primaryExchange: null }), old, NOW, W, { comparableTokens: 2 });
    expect(ctx.state).toBe("stale");
  });
});

describe("us_regular_session_v1", () => {
  it("opens 9:30–16:00 ET on weekdays", () => {
    expect(isUsRegularSessionOpen(new Date("2026-09-18T14:00:00Z"))).toBe(true); // 10:00 ET Fri
    expect(isUsRegularSessionOpen(new Date("2026-09-18T13:00:00Z"))).toBe(false); // 09:00 ET
    expect(isUsRegularSessionOpen(new Date("2026-09-18T20:30:00Z"))).toBe(false); // 16:30 ET
    expect(isUsRegularSessionOpen(new Date("2026-09-20T15:00:00Z"))).toBe(false); // Sunday
  });

  it("closes on NYSE holidays incl. observed dates", () => {
    // Independence Day 2026 falls on Saturday → observed Friday Jul 3
    expect(isUsRegularSessionOpen(new Date("2026-07-03T15:00:00Z"))).toBe(false);
    // Thanksgiving 2026 = Nov 26 (Thu)
    expect(isUsRegularSessionOpen(new Date("2026-11-26T15:00:00Z"))).toBe(false);
    // A normal Friday
    expect(nyseClosedDates(2026).has("2026-09-18")).toBe(false);
  });

  it("computes Good Friday from Easter", () => {
    // Easter 2026 = April 5 → Good Friday April 3
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(nyseClosedDates(2026).has("2026-04-03")).toBe(true);
  });

  it("recognizes only US venues", () => {
    expect(underlyingMarketState("stock", "Nasdaq", NOW).state).toBe("open");
    expect(underlyingMarketState("stock", "XETRA", NOW).state).toBe("unknown");
    expect(underlyingMarketState("stock", null, NOW).state).toBe("unknown");
    expect(underlyingMarketState("etf", "NYSE Arca", NOW).state).toBe("open");
    expect(underlyingMarketState("commodity", "Nasdaq", NOW).state).toBe("unknown");
  });
});
