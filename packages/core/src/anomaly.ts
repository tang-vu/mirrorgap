import type { Severity } from "./domain/enums.js";
import type { Thresholds } from "./config.js";
import type { DispersionMeasurement, GapMeasurement, ReferenceContext } from "./domain/results.js";
import type { EventClassification, EventKind } from "./domain/enums.js";

const ORDER: Severity[] = ["none", "info", "watch", "high", "critical"];

/** Classify a deviation percentage against configured thresholds. */
export function severityFor(absPct: number, thresholds: Thresholds): Severity {
  if (absPct >= thresholds.critical) return "critical";
  if (absPct >= thresholds.high) return "high";
  if (absPct >= thresholds.watch) return "watch";
  if (absPct >= thresholds.info) return "info";
  return "none";
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

export interface SnapshotAnomaly {
  kind: EventKind;
  classification: EventClassification;
  severity: Severity;
  /** The dominant absolute deviation driving this anomaly, in percent. */
  deviationPct: number;
  /** Which token/metric produced it. */
  driver: string;
}

/**
 * Detect whether a snapshot constitutes an anomaly and, if so, what kind.
 *
 * Two independent detectors:
 *  - parity_gap: any wrapper's |gap vs tokenized-aggregate reference| crosses
 *    a threshold (requires ≥1 valid gap measurement).
 *  - cross_wrapper_dispersion: wrappers disagree with each other (requires
 *    ≥2 valid wrappers).
 *
 * Classification: `parity_gap` only when the reference state supports a live
 * comparison (fresh or aging reference AND underlying not closed). Otherwise
 * the same numbers are reported as `price_difference` — real, but explicitly
 * not a verified parity anomaly.
 */
export function detectAnomaly(input: {
  gaps: GapMeasurement[];
  dispersion: DispersionMeasurement;
  reference: ReferenceContext;
  thresholds: Thresholds;
}): SnapshotAnomaly | null {
  const { gaps, dispersion, reference, thresholds } = input;
  if (reference.state === "unavailable" || reference.state === "incomparable") {
    return null;
  }

  const candidates: SnapshotAnomaly[] = [];
  const consider = (a: SnapshotAnomaly) => {
    if (a.severity !== "none") candidates.push(a);
  };

  // Detector 1: per-wrapper gap vs reference
  let maxGap: GapMeasurement | null = null;
  for (const g of gaps) {
    if (!maxGap || Math.abs(g.gapPct) > Math.abs(maxGap.gapPct)) maxGap = g;
  }
  if (maxGap) {
    const sev = severityFor(Math.abs(maxGap.gapPct), thresholds);
    if (sev !== "none") {
      consider({
        kind: "parity_gap",
        classification: "parity_gap", // classification fixed below
        severity: sev,
        deviationPct: maxGap.gapPct,
        driver: maxGap.tokenSymbol,
      });
    }
  }

  // Detector 2: cross-wrapper dispersion
  if (dispersion.dispersionPct !== null) {
    const sev = severityFor(dispersion.dispersionPct, thresholds);
    if (sev !== "none") {
      consider({
        kind: "cross_wrapper_dispersion",
        classification: "parity_gap",
        severity: sev,
        deviationPct: dispersion.dispersionPct,
        driver: `${dispersion.minTokenSymbol ?? "?"}↔${dispersion.maxTokenSymbol ?? "?"}`,
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const s = ORDER.indexOf(b.severity) - ORDER.indexOf(a.severity);
    if (s !== 0) return s;
    return Math.abs(b.deviationPct) - Math.abs(a.deviationPct);
  });
  const best = candidates[0]!;

  // Classification gate: a verified parity anomaly needs a usable reference.
  const verified = reference.state === "fresh" || reference.state === "aging";
  best.classification = verified ? "parity_gap" : "price_difference";
  return best;
}
