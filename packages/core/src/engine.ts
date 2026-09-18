import type { RwaAsset } from "./domain/entities.js";
import type { ReferenceObservation, TokenObservation } from "./domain/observations.js";
import type { IntegritySnapshot } from "./domain/results.js";
import { buildReferenceContext, type FreshnessWindows } from "./freshness.js";
import { measureGaps } from "./parity.js";
import { measureDispersion } from "./dispersion.js";
import { detectAnomaly, type SnapshotAnomaly } from "./anomaly.js";
import { assessDataQuality } from "./quality.js";
import type { Thresholds } from "./config.js";

export interface EvaluateInput {
  scanId: string;
  snapshotId: string;
  asset: RwaAsset;
  reference: ReferenceObservation | null;
  tokens: TokenObservation[];
  thresholds: Thresholds;
  freshness: FreshnessWindows;
  marketPairsAvailable: boolean | null;
  priorConfirmations: number;
  now: Date;
}

export interface EvaluateResult {
  snapshot: IntegritySnapshot;
  anomaly: SnapshotAnomaly | null;
}

/**
 * Pure evaluation of one asset's observations into an IntegritySnapshot plus
 * an optional anomaly verdict. No IO, no clock reads beyond `input.now` —
 * the same inputs always produce the same outputs.
 */
export function evaluateAsset(input: EvaluateInput): EvaluateResult {
  const { asset, reference: referenceObs, tokens, now } = input;

  const { gaps } = measureGaps(tokens, referenceObs);
  const refContext = buildReferenceContext(asset, referenceObs, now, input.freshness, {
    comparableTokens: gaps.length,
  });

  const currency = referenceObs?.currency ?? tokens[0]?.currency ?? "USD";
  const dispersion = measureDispersion(tokens, currency);

  const anomaly = detectAnomaly({
    gaps,
    dispersion,
    reference: refContext,
    thresholds: input.thresholds,
  });

  const tokenTimestampAligned = tokens.every((t) => t.timestampSource === "source");
  const dataQuality = assessDataQuality({
    reference: refContext,
    wrapperCount: tokens.length,
    tokenTimestampAligned,
    marketPairsAvailable: input.marketPairsAvailable,
    confirmations: input.priorConfirmations + (anomaly ? 1 : 0),
  });

  const snapshot: IntegritySnapshot = {
    snapshotId: input.snapshotId,
    scanId: input.scanId,
    rwaId: asset.rwaId,
    measuredAt: now.toISOString(),
    reference: refContext,
    gaps,
    dispersion,
    dataQuality,
    severity: anomaly?.severity ?? "none",
    classification: anomaly?.classification ?? null,
    observationIds: [referenceObs?.observationId, ...tokens.map((t) => t.observationId)].filter(
      (x): x is string => Boolean(x),
    ),
  };

  return { snapshot, anomaly };
}
