import type { DataQuality, DataQualityFactor, ReferenceContext } from "./domain/results.js";
import { roundForHash } from "./canonical.js";

export const FORMULA_DATA_QUALITY = "data_quality_v1";

/**
 * data_quality_v1 — transparent weighted factor model.
 *
 *   score = Σ(factor_score × weight) / Σ(weights)
 *
 * Factors and weights are fixed by the formula version and always emitted
 * with the score, so a judge can recompute it by hand. No hidden terms.
 */
export function assessDataQuality(input: {
  reference: ReferenceContext;
  wrapperCount: number;
  tokenTimestampAligned: boolean;
  marketPairsAvailable: boolean | null; // null = capability unavailable (plan-gated)
  confirmations: number;
}): DataQuality {
  const factors: DataQualityFactor[] = [];

  const freshScore =
    input.reference.aggregateFreshness.state === "fresh"
      ? 1
      : input.reference.aggregateFreshness.state === "aging"
        ? 0.6
        : input.reference.aggregateFreshness.state === "stale"
          ? 0.2
          : 0;
  factors.push({
    name: "reference_freshness",
    score: freshScore,
    weight: 0.3,
    detail: `aggregate reference is ${input.reference.aggregateFreshness.state}`,
  });

  factors.push({
    name: "timestamp_alignment",
    score: input.tokenTimestampAligned ? 1 : 0.7,
    weight: 0.15,
    detail: input.tokenTimestampAligned
      ? "token observations carry source timestamps"
      : "token observations use retrieval time (no upstream timestamp)",
  });

  const wrapperScore =
    input.wrapperCount >= 3 ? 1 : input.wrapperCount === 2 ? 0.8 : input.wrapperCount === 1 ? 0.4 : 0;
  factors.push({
    name: "wrapper_coverage",
    score: wrapperScore,
    weight: 0.2,
    detail: `${input.wrapperCount} token representation(s) observed`,
  });

  const marketScore =
    input.reference.underlyingMarket === "open"
      ? 1
      : input.reference.underlyingMarket === "continuous"
        ? 1
        : input.reference.underlyingMarket === "unknown"
          ? 0.7
          : 0.4;
  factors.push({
    name: "underlying_market_state",
    score: marketScore,
    weight: 0.15,
    detail: input.reference.underlyingDetail,
  });

  factors.push({
    name: "persistence",
    score: input.confirmations >= 2 ? 1 : 0.6,
    weight: 0.1,
    detail: `${input.confirmations} confirming scan(s)`,
  });

  // Plan-gated market-pair data is an enhancement, not a penalty: when the
  // capability is unavailable we score 0.8 rather than pretend it exists.
  const mpScore = input.marketPairsAvailable === null ? 0.8 : input.marketPairsAvailable ? 1 : 0.9;
  factors.push({
    name: "market_pair_corroboration",
    score: mpScore,
    weight: 0.1,
    detail:
      input.marketPairsAvailable === null
        ? "market-pairs endpoint unavailable on this plan"
        : input.marketPairsAvailable
          ? "per-market observations corroborate"
          : "no market-pair observations returned",
  });

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
  return { score: roundForHash(score, 4), factors };
}
