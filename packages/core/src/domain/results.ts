import { z } from "zod";
import {
  ClaimKindSchema,
  EventClassificationSchema,
  EventKindSchema,
  EventStatusSchema,
  FreshnessStateSchema,
  MarketStateSchema,
  ReferenceStateSchema,
  SeveritySchema,
} from "./enums.js";
import { ProvenanceSchema } from "./observations.js";

/** Freshness verdict for one observation stream. */
export const FreshnessAssessmentSchema = z.object({
  state: FreshnessStateSchema,
  observedAt: z.string().datetime().nullable(),
  ageSeconds: z.number().nonnegative().nullable(),
  evaluatedAt: z.string().datetime(),
});
export type FreshnessAssessment = z.infer<typeof FreshnessAssessmentSchema>;

/** Combined reference context for a parity comparison. */
export const ReferenceContextSchema = z.object({
  state: ReferenceStateSchema,
  aggregateFreshness: FreshnessAssessmentSchema,
  underlyingMarket: MarketStateSchema,
  underlyingDetail: z.string(),
  marketHoursHeuristic: z.string().nullable(),
  explanations: z.array(z.string()),
});
export type ReferenceContext = z.infer<typeof ReferenceContextSchema>;

/** Per-token parity gap vs the reference. `parity_gap_v1`. */
export const GapMeasurementSchema = z.object({
  cryptoId: z.number().int().positive(),
  tokenSymbol: z.string(),
  tokenPrice: z.number().positive(),
  referencePrice: z.number().positive(),
  currency: z.string(),
  gapPct: z.number(),
  tokenObservedAt: z.string().datetime(),
  referenceObservedAt: z.string().datetime(),
  limitations: z.array(z.string()),
});
export type GapMeasurement = z.infer<typeof GapMeasurementSchema>;

/** Cross-wrapper dispersion. `dispersion_v1`. */
export const DispersionMeasurementSchema = z.object({
  wrapperCount: z.number().int().nonnegative(),
  minPrice: z.number().positive().nullable(),
  maxPrice: z.number().positive().nullable(),
  medianPrice: z.number().positive().nullable(),
  meanPrice: z.number().positive().nullable(),
  dispersionPct: z.number().nullable(),
  maxPositiveDeviationPct: z.number().nullable(),
  maxNegativeDeviationPct: z.number().nullable(),
  minTokenSymbol: z.string().nullable(),
  maxTokenSymbol: z.string().nullable(),
});
export type DispersionMeasurement = z.infer<typeof DispersionMeasurementSchema>;

/**
 * Decomposed data-quality assessment (`data_quality_v1`). Each factor is a
 * transparent 0..1 score with a documented weight — never an opaque score.
 */
export const DataQualityFactorSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(1),
  weight: z.number().positive(),
  detail: z.string(),
});
export const DataQualitySchema = z.object({
  score: z.number().min(0).max(1),
  factors: z.array(DataQualityFactorSchema),
});
export type DataQuality = z.infer<typeof DataQualitySchema>;
export type DataQualityFactor = z.infer<typeof DataQualityFactorSchema>;

/** Everything computed for one asset in one scan. */
export const IntegritySnapshotSchema = z.object({
  snapshotId: z.string(),
  scanId: z.string(),
  rwaId: z.number().int().positive(),
  measuredAt: z.string().datetime(),
  reference: ReferenceContextSchema,
  gaps: z.array(GapMeasurementSchema),
  dispersion: DispersionMeasurementSchema,
  dataQuality: DataQualitySchema,
  severity: SeveritySchema,
  classification: EventClassificationSchema.nullable(),
  observationIds: z.array(z.string()),
});
export type IntegritySnapshot = z.infer<typeof IntegritySnapshotSchema>;

/** Anomaly event with lifecycle + persistence tracking. */
export const AnomalyEventSchema = z.object({
  eventId: z.string(),
  rwaId: z.number().int().positive(),
  assetSymbol: z.string(),
  kind: EventKindSchema,
  classification: EventClassificationSchema,
  severity: SeveritySchema,
  status: EventStatusSchema,
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  confirmations: z.number().int().positive(),
  maxDeviationPct: z.number(),
  latestDeviationPct: z.number(),
  latestSnapshotId: z.string(),
  resolvedAt: z.string().datetime().nullable(),
  dataMode: z.enum(["live", "fixture"]),
});
export type AnomalyEvent = z.infer<typeof AnomalyEventSchema>;

/** One entry in an investigation's claim ledger. */
export const EvidenceClaimSchema = z.object({
  claimId: z.string(),
  kind: ClaimKindSchema,
  statement: z.string(),
  evidenceIds: z.array(z.string()),
  formulaId: z.string().optional(),
  inputs: z.array(z.string()).optional(),
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

export const InvestigationSchema = z.object({
  investigationId: z.string(),
  eventId: z.string(),
  createdAt: z.string().datetime(),
  claims: z.array(EvidenceClaimSchema),
  limitations: z.array(z.string()),
  narrator: z.enum(["deterministic", "llm_validated"]),
});
export type Investigation = z.infer<typeof InvestigationSchema>;

/** A scan run = one pass over all tracked assets. */
export const ScanRunSchema = z.object({
  scanId: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  dataMode: z.enum(["live", "fixture"]),
  assetsScanned: z.number().int().nonnegative(),
  anomaliesFound: z.number().int().nonnegative(),
  status: z.enum(["running", "completed", "failed"]),
  error: z.string().nullable(),
});
export type ScanRun = z.infer<typeof ScanRunSchema>;
