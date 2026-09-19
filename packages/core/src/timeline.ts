import type { AnomalyEvent } from "./domain/results.js";
import type { EventTransition, TimelineEntry } from "./domain/timeline.js";

const SEV_ORDER: Record<string, number> = { none: 0, info: 1, watch: 2, high: 3, critical: 4 };

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toFixed(2)}%`);
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

/**
 * Build the incident timeline for one anomaly event from its persisted
 * transitions. Pure and deterministic: the same stored rows always render
 * the same narrative.
 *
 * Narrative semantics (mirrors the engine lifecycle):
 *   created              → "candidate anomaly created" (or opened if instantly confirmed)
 *   confirmed            → "anomaly confirmed after N confirmations"
 *   updated (dev up)     → "divergence increased"; new running max → "peak divergence"
 *   updated (dev down)   → "divergence decreasing"
 *   updated (sev change) → "severity escalated/decreased"
 *   resolved             → "returned inside normal range — incident resolved"
 *   invalidated          → "data no longer comparable — incident invalidated"
 */
export function buildIncidentTimeline(
  event: AnomalyEvent,
  transitions: EventTransition[],
  opts: { receiptIssuedAt?: string | null } = {},
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const sorted = [...transitions].sort((a, b) => a.at.localeCompare(b.at));
  let runningPeak = -1;
  let prevSev: string | null = null;
  let prevDev: number | null = null;

  for (const t of sorted) {
    const dev = t.deviationPct;
    const absDev = dev === null ? null : Math.abs(dev);
    const base = {
      at: t.at,
      severity: t.severity,
      deviationPct: dev,
      snapshotId: t.snapshotId,
      frame: t.frame,
    };

    if (t.transition === "created") {
      entries.push({
        ...base,
        type: "candidate_created",
        title: t.severity === "none" ? "Observation outside thresholds" : "Anomaly candidate created",
        detail:
          `${event.assetSymbol} ${event.kind === "parity_gap" ? "parity gap" : "cross-wrapper dispersion"} ` +
          `first measured at ${pct(dev)} — severity ${t.severity}. ` +
          `Reference state: ${t.frame?.referenceState ?? "unknown"}.`,
      });
    } else if (t.transition === "confirmed") {
      entries.push({
        ...base,
        type: sorted.some((x) => x !== t && x.transition === "created") ? "confirmed" : "candidate_created",
        title:
          event.confirmations > 1 || t.detail.includes("confirmation")
            ? "Anomaly confirmed"
            : "Anomaly opened (confirmed on first observation)",
        detail: t.detail,
      });
    } else if (t.transition === "updated") {
      if (prevSev !== null && SEV_ORDER[t.severity]! > SEV_ORDER[prevSev]!) {
        entries.push({
          ...base,
          type: "severity_escalated",
          title: `Severity escalated: ${prevSev} → ${t.severity}`,
          detail: `Deviation now ${pct(dev)}.`,
        });
      } else if (prevSev !== null && SEV_ORDER[t.severity]! < SEV_ORDER[prevSev]!) {
        entries.push({
          ...base,
          type: "severity_decreased",
          title: `Severity decreased: ${prevSev} → ${t.severity}`,
          detail: `Deviation now ${pct(dev)}.`,
        });
      }
      if (absDev !== null && absDev > runningPeak) {
        runningPeak = absDev;
        entries.push({
          ...base,
          type: prevDev === null ? "observation" : "peak_divergence",
          title: prevDev === null ? "Observation recorded" : "Peak divergence reached",
          detail: `${dev! >= 0 ? "+" : ""}${dev!.toFixed(2)}% — largest deviation so far in this incident.`,
        });
      } else if (prevDev !== null && absDev !== null) {
        const increased = absDev > Math.abs(prevDev);
        entries.push({
          ...base,
          type: increased ? "deviation_increased" : "deviation_decreased",
          title: increased ? "Divergence increased" : "Divergence decreasing",
          detail: `${signed(prevDev)} → ${signed(dev!)}.`,
        });
      } else {
        entries.push({
          ...base,
          type: "observation",
          title: "Observation recorded",
          detail: t.detail,
        });
      }
    } else if (t.transition === "resolved") {
      entries.push({
        ...base,
        type: "resolved",
        title: "Incident resolved — returned inside normal range",
        detail: t.detail,
      });
    } else if (t.transition === "invalidated") {
      entries.push({
        ...base,
        type: "invalidated",
        title: "Incident invalidated — data no longer comparable",
        detail: t.detail,
      });
    }

    if (absDev !== null && absDev > runningPeak) runningPeak = absDev;
    prevSev = t.severity;
    prevDev = dev;
  }

  if (opts.receiptIssuedAt) {
    entries.push({
      at: opts.receiptIssuedAt,
      type: "receipt_issued",
      title: "Evidence receipt issued",
      detail:
        "Canonical JSON → SHA-256" + (event.status === "confirmed" ? " · signable (Ed25519)" : "") + ".",
      severity: event.severity,
      deviationPct: null,
      snapshotId: null,
    });
  }

  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
