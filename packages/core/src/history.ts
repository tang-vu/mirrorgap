import { z } from "zod";
import type { AnomalyEvent, IntegritySnapshot } from "./domain/results.js";
import type { EventTransition } from "./domain/timeline.js";

/**
 * Historical integrity series — deterministic derivations over persisted
 * snapshots. Nothing here invents data: every point maps 1:1 to a stored
 * IntegritySnapshot (or a deterministic bucket of them).
 */

export const HistoryWindowSchema = z.enum(["1h", "6h", "24h", "7d", "all"]);
export type HistoryWindow = z.infer<typeof HistoryWindowSchema>;

export const HISTORY_WINDOWS: HistoryWindow[] = ["1h", "6h", "24h", "7d", "all"];

/** Window → milliseconds. "all" returns null (no lower bound). */
export function windowToMs(w: HistoryWindow): number | null {
  switch (w) {
    case "1h":
      return 3_600_000;
    case "6h":
      return 21_600_000;
    case "24h":
      return 86_400_000;
    case "7d":
      return 604_800_000;
    case "all":
      return null;
  }
}

/** One plottable point of an asset's integrity history. */
export interface HistoryPoint {
  measuredAt: string;
  /** Largest |gap| across wrappers at this instant. */
  maxAbsGapPct: number | null;
  /** Signed gap of the most-deviating wrapper (direction matters). */
  maxSignedGapPct: number | null;
  dispersionPct: number | null;
  severity: string;
  referenceState: string;
  aggregateFreshness: string;
  underlyingMarket: string;
  dataQuality: number;
  wrapperCount: number;
  snapshotId: string;
}

/** Snapshot → compact history point. Pure. */
export function snapshotToPoint(s: IntegritySnapshot): HistoryPoint {
  let maxAbs: number | null = null;
  let maxSigned: number | null = null;
  for (const g of s.gaps) {
    if (maxAbs === null || Math.abs(g.gapPct) > maxAbs) {
      maxAbs = Math.abs(g.gapPct);
      maxSigned = g.gapPct;
    }
  }
  return {
    measuredAt: s.measuredAt,
    maxAbsGapPct: maxAbs,
    maxSignedGapPct: maxSigned,
    dispersionPct: s.dispersion.dispersionPct,
    severity: s.severity,
    referenceState: s.reference.state,
    aggregateFreshness: s.reference.aggregateFreshness.state,
    underlyingMarket: s.reference.underlyingMarket,
    dataQuality: s.dataQuality.score,
    wrapperCount: s.dispersion.wrapperCount,
    snapshotId: s.snapshotId,
  };
}

/**
 * Deterministic downsampler: split the time range into `maxPoints`
 * equal-width buckets and keep, per bucket, the point with the largest
 * |gap| (falling back to dispersion when no gap exists). This preserves
 * peaks — the thing an integrity chart must never smooth away.
 * Input must be time-ascending.
 */
export function downsamplePoints(points: HistoryPoint[], maxPoints: number): HistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const first = new Date(points[0]!.measuredAt).getTime();
  const last = new Date(points[points.length - 1]!.measuredAt).getTime();
  const span = Math.max(1, last - first);
  const buckets: HistoryPoint[] = new Array<HistoryPoint>(maxPoints) as HistoryPoint[];
  const score = (p: HistoryPoint) => p.maxAbsGapPct ?? p.dispersionPct ?? 0;
  for (const p of points) {
    const t = new Date(p.measuredAt).getTime();
    const idx = Math.min(maxPoints - 1, Math.floor(((t - first) / span) * maxPoints));
    const cur = buckets[idx];
    if (!cur || score(p) >= score(cur)) buckets[idx] = p;
  }
  return buckets.filter((p): p is HistoryPoint => Boolean(p));
}

/** Aggregate stats over a history window. */
export interface HistoryStats {
  points: number;
  firstMeasuredAt: string | null;
  lastMeasuredAt: string | null;
  peakAbsGapPct: number | null;
  peakAt: string | null;
  peakDispersionPct: number | null;
  staleShare: number;
  marketClosedShare: number;
  anomalousShare: number;
}

export function historyStats(points: HistoryPoint[]): HistoryStats {
  if (points.length === 0) {
    return {
      points: 0,
      firstMeasuredAt: null,
      lastMeasuredAt: null,
      peakAbsGapPct: null,
      peakAt: null,
      peakDispersionPct: null,
      staleShare: 0,
      marketClosedShare: 0,
      anomalousShare: 0,
    };
  }
  let peakAbs = -1;
  let peakAt: string | null = null;
  let peakDisp = -1;
  let stale = 0;
  let closed = 0;
  let anomalous = 0;
  for (const p of points) {
    if (p.maxAbsGapPct !== null && p.maxAbsGapPct > peakAbs) {
      peakAbs = p.maxAbsGapPct;
      peakAt = p.measuredAt;
    }
    if (p.dispersionPct !== null && p.dispersionPct > peakDisp) peakDisp = p.dispersionPct;
    if (p.aggregateFreshness === "stale") stale += 1;
    if (p.referenceState === "market_closed") closed += 1;
    if (p.severity !== "none") anomalous += 1;
  }
  return {
    points: points.length,
    firstMeasuredAt: points[0]!.measuredAt,
    lastMeasuredAt: points[points.length - 1]!.measuredAt,
    peakAbsGapPct: peakAbs >= 0 ? peakAbs : null,
    peakAt,
    peakDispersionPct: peakDisp >= 0 ? peakDisp : null,
    staleShare: stale / points.length,
    marketClosedShare: closed / points.length,
    anomalousShare: anomalous / points.length,
  };
}

/** Lifecycle stats for one incident, derived from event + transitions. */
export interface IncidentStats {
  eventId: string;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  confirmations: number;
  peakDeviationPct: number;
  peakAt: string | null;
  /** Milliseconds between first seen and resolution (or now-equivalent lastSeen). */
  durationMs: number;
  /** Scans that touched this incident. */
  observations: number;
  /** How many times this asset+kind reopened after resolution. */
  recurrences: number;
}

export function incidentStats(
  event: AnomalyEvent,
  transitions: EventTransition[],
  allEventIds: string[],
): IncidentStats {
  const sorted = [...transitions].sort((a, b) => a.at.localeCompare(b.at));
  let peak = Math.abs(event.maxDeviationPct);
  let peakAt: string | null = null;
  for (const t of sorted) {
    if (t.deviationPct !== null && Math.abs(t.deviationPct) >= peak) {
      peak = Math.abs(t.deviationPct);
      peakAt = t.at;
    }
  }
  const end = event.resolvedAt ?? event.lastSeenAt;
  return {
    eventId: event.eventId,
    status: event.status,
    firstSeenAt: event.firstSeenAt,
    lastSeenAt: event.lastSeenAt,
    resolvedAt: event.resolvedAt,
    confirmations: event.confirmations,
    peakDeviationPct: event.maxDeviationPct,
    peakAt: peakAt ?? event.lastSeenAt,
    durationMs: Math.max(0, new Date(end).getTime() - new Date(event.firstSeenAt).getTime()),
    observations: sorted.length,
    recurrences: Math.max(0, allEventIds.length - 1),
  };
}
