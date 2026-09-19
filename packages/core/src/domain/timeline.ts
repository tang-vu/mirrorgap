import { z } from "zod";
import { SeveritySchema } from "./enums.js";
import { ThresholdsSchema } from "../config.js";

/**
 * A persisted record of something that happened to an anomaly event during a
 * scan. Transitions are the raw material of the incident timeline: they are
 * written on every lifecycle change AND on every confirming update so the
 * full arc (candidate → confirmed → peak → resolved) is reconstructible.
 *
 * `frame` embeds a compact snapshot summary so a timeline/replay view does
 * not need to load full snapshots.
 */
export const EventTransitionSchema = z.object({
  id: z.number().int().optional(),
  eventId: z.string(),
  rwaId: z.number().int().positive(),
  at: z.string().datetime(),
  transition: z.enum(["created", "confirmed", "updated", "resolved", "invalidated"]),
  severity: SeveritySchema,
  deviationPct: z.number().nullable(),
  snapshotId: z.string().nullable(),
  detail: z.string(),
  frame: z
    .object({
      referenceState: z.string(),
      underlyingMarket: z.string(),
      aggregateFreshness: z.string(),
      dispersionPct: z.number().nullable(),
      maxAbsGapPct: z.number().nullable(),
      dataQuality: z.number().nullable(),
      gaps: z.array(z.object({ tokenSymbol: z.string(), gapPct: z.number() })),
    })
    .optional(),
});
export type EventTransition = z.infer<typeof EventTransitionSchema>;

/** One rendered row of an incident timeline — derived, never stored. */
export const TimelineEntrySchema = z.object({
  at: z.string().datetime(),
  type: z.enum([
    "observation",
    "candidate_created",
    "confirmed",
    "deviation_increased",
    "deviation_decreased",
    "peak_divergence",
    "severity_escalated",
    "severity_decreased",
    "returned_to_normal",
    "resolved",
    "invalidated",
    "receipt_issued",
  ]),
  title: z.string(),
  detail: z.string(),
  severity: SeveritySchema.optional(),
  deviationPct: z.number().nullable().optional(),
  snapshotId: z.string().nullable().optional(),
  frame: EventTransitionSchema.shape.frame.optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

/** A watched asset with optional per-asset threshold override. */
export const WatchlistEntrySchema = z.object({
  rwaId: z.number().int().positive(),
  symbol: z.string().min(1),
  addedAt: z.string().datetime(),
  /** Per-asset severity thresholds; null = inherit global config. */
  thresholds: ThresholdsSchema.nullable(),
  enabled: z.boolean(),
});
export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>;

/** Delivery record for one alert emission — powers dedup and audit. */
export const AlertRecordSchema = z.object({
  id: z.number().int().optional(),
  eventId: z.string(),
  transition: z.string(),
  severity: z.string(),
  destination: z.string(),
  status: z.enum(["sent", "failed"]),
  sentAt: z.string().datetime(),
  detail: z.string().nullable(),
});
export type AlertRecord = z.infer<typeof AlertRecordSchema>;
