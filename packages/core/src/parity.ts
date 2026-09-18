import type { GapMeasurement } from "./domain/results.js";
import type { ReferenceObservation, TokenObservation } from "./domain/observations.js";
import { roundForHash } from "./canonical.js";

export const FORMULA_PARITY_GAP = "parity_gap_v1";

/**
 * parity_gap_v1:
 *   gap_pct = (token_price − reference_price) / reference_price × 100
 *
 * Produces a GapMeasurement only when the comparison is economically and
 * temporally defensible. Every emitted measurement carries the inputs,
 * timestamps, and explicit limitations; invalid inputs yield `null` plus a
 * reason via `measureGaps`'s report — never a fabricated number.
 */
export function measureGap(token: TokenObservation, reference: ReferenceObservation): GapMeasurement | null {
  if (token.currency !== reference.currency) return null;
  if (!Number.isFinite(token.price) || token.price <= 0) return null;
  if (!Number.isFinite(reference.price) || reference.price <= 0) return null;

  const limitations: string[] = [];
  if (token.timestampSource === "retrieval") {
    limitations.push("Token observation has no upstream timestamp; retrieval time used.");
  }
  const gapPct = ((token.price - reference.price) / reference.price) * 100;

  return {
    cryptoId: token.cryptoId,
    tokenSymbol: token.observationId.split(":").pop() ?? String(token.cryptoId),
    tokenPrice: token.price,
    referencePrice: reference.price,
    currency: token.currency,
    gapPct: roundForHash(gapPct, 6),
    tokenObservedAt: token.observedAt,
    referenceObservedAt: reference.observedAt,
    limitations,
  };
}

export interface GapReport {
  gaps: GapMeasurement[];
  skipped: { cryptoId: number; reason: string }[];
}

/** Measure gaps for all tokens against one reference observation. */
export function measureGaps(tokens: TokenObservation[], reference: ReferenceObservation | null): GapReport {
  const gaps: GapMeasurement[] = [];
  const skipped: GapReport["skipped"] = [];
  if (!reference) {
    return {
      gaps,
      skipped: tokens.map((t) => ({
        cryptoId: t.cryptoId,
        reason: "no reference observation",
      })),
    };
  }
  for (const t of tokens) {
    if (t.currency !== reference.currency) {
      skipped.push({
        cryptoId: t.cryptoId,
        reason: `currency mismatch (${t.currency} vs ${reference.currency})`,
      });
      continue;
    }
    if (!Number.isFinite(t.price) || t.price <= 0) {
      skipped.push({ cryptoId: t.cryptoId, reason: "invalid token price" });
      continue;
    }
    const g = measureGap(t, reference);
    if (g) gaps.push(g);
  }
  return { gaps, skipped };
}
