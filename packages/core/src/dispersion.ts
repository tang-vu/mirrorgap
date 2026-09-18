import type { DispersionMeasurement } from "./domain/results.js";
import type { TokenObservation } from "./domain/observations.js";
import { roundForHash } from "./canonical.js";

export const FORMULA_DISPERSION = "dispersion_v1";

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * dispersion_v1:
 *   dispersion_pct = (max_price − min_price) / median_price × 100
 * plus max positive/negative deviation of individual wrappers vs median.
 *
 * Only tokens priced in `currency` with finite positive prices participate.
 * With <2 valid wrappers, dispersion is reported as null — honest "cannot
 * compute", not a silent zero.
 */
export function measureDispersion(tokens: TokenObservation[], currency: string): DispersionMeasurement {
  const valid = tokens.filter((t) => t.currency === currency && Number.isFinite(t.price) && t.price > 0);
  const base: DispersionMeasurement = {
    wrapperCount: valid.length,
    minPrice: null,
    maxPrice: null,
    medianPrice: null,
    meanPrice: null,
    dispersionPct: null,
    maxPositiveDeviationPct: null,
    maxNegativeDeviationPct: null,
    minTokenSymbol: null,
    maxTokenSymbol: null,
  };
  if (valid.length === 0) return base;

  const sorted = [...valid].sort((a, b) => a.price - b.price);
  const prices = sorted.map((t) => t.price);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const med = median(prices);
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;

  base.minPrice = min.price;
  base.maxPrice = max.price;
  base.medianPrice = med;
  base.meanPrice = roundForHash(mean, 8);
  base.minTokenSymbol = min.observationId.split(":").pop() ?? null;
  base.maxTokenSymbol = max.observationId.split(":").pop() ?? null;

  if (valid.length < 2 || med <= 0) return base;

  base.dispersionPct = roundForHash(((max.price - min.price) / med) * 100, 6);
  base.maxPositiveDeviationPct = roundForHash(((max.price - med) / med) * 100, 6);
  base.maxNegativeDeviationPct = roundForHash(((min.price - med) / med) * 100, 6);
  return base;
}
