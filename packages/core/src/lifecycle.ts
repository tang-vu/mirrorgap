import type { AnomalyEvent, IntegritySnapshot } from "./domain/results.js";
import type { SnapshotAnomaly } from "./anomaly.js";
import type { EventStatus } from "./domain/enums.js";

/**
 * Event lifecycle:
 *
 *   (no event) --anomaly seen--> candidate
 *   candidate --confirmations >= confirmScans--> confirmed
 *   candidate|confirmed --scan below threshold--> resolved
 *   candidate --data no longer comparable--> invalidated
 *
 * Persistence fields (firstSeen/lastSeen/confirmations/max/latest) are updated
 * on every confirming scan. `classification` tracks the latest snapshot.
 */
export interface LifecycleResult {
  event: AnomalyEvent;
  transition: "created" | "confirmed" | "resolved" | "invalidated" | "updated" | "none";
}

export function applyScanToEvent(
  existing: AnomalyEvent | null,
  snapshot: IntegritySnapshot,
  anomaly: SnapshotAnomaly | null,
  opts: {
    confirmScans: number;
    now: Date;
    eventIdFactory: () => string;
    assetSymbol: string;
    dataMode: "live" | "fixture";
  },
): LifecycleResult | null {
  const now = opts.now.toISOString();

  // Case 1: anomaly present
  if (anomaly && snapshot.severity !== "none") {
    if (!existing || existing.status === "resolved" || existing.status === "invalidated") {
      const event: AnomalyEvent = {
        eventId: opts.eventIdFactory(),
        rwaId: snapshot.rwaId,
        assetSymbol: opts.assetSymbol,
        kind: anomaly.kind,
        classification: anomaly.classification,
        severity: snapshot.severity,
        status: opts.confirmScans <= 1 ? "confirmed" : "candidate",
        firstSeenAt: now,
        lastSeenAt: now,
        confirmations: 1,
        maxDeviationPct: anomaly.deviationPct,
        latestDeviationPct: anomaly.deviationPct,
        latestSnapshotId: snapshot.snapshotId,
        resolvedAt: null,
        dataMode: opts.dataMode,
      };
      return { event, transition: event.status === "confirmed" ? "confirmed" : "created" };
    }

    // Existing open event — update persistence fields
    const confirmations = existing.confirmations + 1;
    const status: EventStatus =
      existing.status === "confirmed" || confirmations >= opts.confirmScans ? "confirmed" : "candidate";
    const transition = existing.status === "candidate" && status === "confirmed" ? "confirmed" : "updated";
    return {
      event: {
        ...existing,
        severity: snapshot.severity,
        classification: anomaly.classification,
        status,
        lastSeenAt: now,
        confirmations,
        maxDeviationPct:
          Math.abs(anomaly.deviationPct) > Math.abs(existing.maxDeviationPct)
            ? anomaly.deviationPct
            : existing.maxDeviationPct,
        latestDeviationPct: anomaly.deviationPct,
        latestSnapshotId: snapshot.snapshotId,
      },
      transition,
    };
  }

  // Case 2: no anomaly this scan — open events resolve
  if (existing && (existing.status === "candidate" || existing.status === "confirmed")) {
    if (snapshot.reference.state === "unavailable" || snapshot.reference.state === "incomparable") {
      return {
        event: { ...existing, status: "invalidated", resolvedAt: now, latestSnapshotId: snapshot.snapshotId },
        transition: "invalidated",
      };
    }
    return {
      event: {
        ...existing,
        status: "resolved",
        resolvedAt: now,
        latestSnapshotId: snapshot.snapshotId,
        latestDeviationPct: 0,
      },
      transition: "resolved",
    };
  }

  return null;
}
