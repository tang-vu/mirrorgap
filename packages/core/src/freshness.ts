import type { FreshnessAssessment, ReferenceContext } from "./domain/results.js";
import type { ReferenceObservation } from "./domain/observations.js";
import type { RwaAsset } from "./domain/entities.js";
import { underlyingMarketState } from "./market-hours.js";

export interface FreshnessWindows {
  freshSeconds: number;
  agingSeconds: number;
}

/**
 * Assess how fresh an observation timestamp is at `evaluatedAt`.
 * `observedAt` may be null (no timestamp supplied upstream) → "unavailable".
 */
export function assessFreshness(
  observedAt: string | null,
  evaluatedAt: Date,
  windows: FreshnessWindows,
): FreshnessAssessment {
  if (!observedAt) {
    return {
      state: "unavailable",
      observedAt: null,
      ageSeconds: null,
      evaluatedAt: evaluatedAt.toISOString(),
    };
  }
  const age = (evaluatedAt.getTime() - new Date(observedAt).getTime()) / 1000;
  if (!Number.isFinite(age) || age < 0) {
    // Future-dated observations are treated as fresh (clock skew tolerance)
    // but age is reported honestly.
    return {
      state: "fresh",
      observedAt,
      ageSeconds: Math.max(0, age),
      evaluatedAt: evaluatedAt.toISOString(),
    };
  }
  const state = age <= windows.freshSeconds ? "fresh" : age <= windows.agingSeconds ? "aging" : "stale";
  return { state, observedAt, ageSeconds: age, evaluatedAt: evaluatedAt.toISOString() };
}

/**
 * Build the reference context for a parity comparison.
 *
 * Reference-state semantics:
 *  - `fresh`/`aging`/`stale`: the tokenized-aggregate reference age.
 *  - `market_closed`: reference may be fresh, but the underlying TradFi venue
 *    is closed so the gap cannot be verified against the real asset — the
 *    observed difference is labelled a price difference, not a parity anomaly.
 *  - `unavailable`: no reference observation at all.
 *  - `incomparable`: reference exists but cannot be compared (e.g. no tokens
 *    priced in the same currency).
 */
export function buildReferenceContext(
  asset: RwaAsset,
  reference: ReferenceObservation | null,
  evaluatedAt: Date,
  windows: FreshnessWindows,
  opts: { comparableTokens: number },
): ReferenceContext {
  const explanations: string[] = [];

  if (!reference) {
    return {
      state: "unavailable",
      aggregateFreshness: assessFreshness(null, evaluatedAt, windows),
      underlyingMarket: "unknown",
      underlyingDetail: "No tokenized-aggregate reference observation",
      marketHoursHeuristic: null,
      explanations: ["No reference observation was returned for this asset."],
    };
  }

  const aggregateFreshness = assessFreshness(reference.observedAt, evaluatedAt, windows);
  const market = underlyingMarketState(asset.assetType, asset.primaryExchange ?? null, evaluatedAt);
  explanations.push(market.detail);

  if (aggregateFreshness.state === "fresh") {
    explanations.push("Tokenized-aggregate reference is fresh.");
  } else if (aggregateFreshness.state === "aging") {
    explanations.push("Tokenized-aggregate reference is aging; treat the gap as indicative, not verified.");
  } else if (aggregateFreshness.state === "stale") {
    explanations.push(
      "Tokenized-aggregate reference is stale; observed differences are not live parity gaps.",
    );
  }

  let state: ReferenceContext["state"];
  if (opts.comparableTokens === 0) {
    state = "incomparable";
    explanations.push("No token observations in the reference currency — comparison impossible.");
  } else if (market.state === "closed") {
    state = "market_closed";
  } else {
    state = aggregateFreshness.state === "unavailable" ? "unavailable" : aggregateFreshness.state;
  }

  return {
    state,
    aggregateFreshness,
    underlyingMarket: market.state,
    underlyingDetail: market.detail,
    marketHoursHeuristic: market.heuristic,
    explanations,
  };
}
