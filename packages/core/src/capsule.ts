import type { EvidenceReceipt, VerifyResult } from "./receipt.js";
import type { AnomalyEvent } from "./domain/results.js";
import type { IncidentStats } from "./history.js";

/**
 * Evidence Capsule — the public, shareable presentation of an evidence
 * receipt. The capsule is a VIEW over the stored receipt: it adds human
 * context and verification status but never alters the hashed payload.
 * `receipt` inside the capsule is the exact canonical object that hashes
 * to `receipt.receiptHash`.
 */
export interface EvidenceCapsule {
  capsuleVersion: 1;
  eventId: string;
  receiptId: string;
  generatedAt: string;
  dataMode: "live" | "fixture";
  asset: {
    rwaId: number;
    symbol: string;
    name: string;
    assetType: string;
    primaryExchange: string | null;
  };
  representations: { cryptoId: number; symbol: string; name: string; issuerName: string | null }[];
  observed: {
    divergencePct: number;
    peakDeviationPct: number;
    referenceState: string;
    aggregateFreshness: string;
    aggregateAgeSeconds: number | null;
    underlyingMarket: string;
    marketHoursHeuristic: string | null;
    dispersionPct: number | null;
    wrapperCount: number;
  };
  lifecycle: {
    status: string;
    kind: string;
    classification: string;
    severity: string;
    firstSeenAt: string;
    lastSeenAt: string;
    resolvedAt: string | null;
    confirmations: number;
    durationMs: number;
    recurrences: number;
  };
  claims: { kind: string; statement: string }[];
  /** Claim-kind histogram for quick scan. */
  claimSummary: Record<string, number>;
  limitations: string[];
  provenance: { endpoint: string; retrievedAt: string; dataMode: string; requestId: string }[];
  integrity: {
    receiptHash: string;
    signature: { alg: string; publicKey: string } | null;
    signed: boolean;
    verification: {
      ok: boolean;
      schemaOk: boolean;
      hashOk: boolean;
      signatureOk: boolean | null;
      errors: string[];
    };
  };
  /** Canonical receipt payload — the exact object that was hashed. */
  receipt: EvidenceReceipt;
}

export function buildCapsule(input: {
  event: AnomalyEvent;
  receipt: EvidenceReceipt;
  verification: VerifyResult;
  stats?: IncidentStats | null;
}): EvidenceCapsule {
  const { event, receipt, verification } = input;
  const claimSummary: Record<string, number> = {};
  for (const c of receipt.claims) claimSummary[c.kind] = (claimSummary[c.kind] ?? 0) + 1;
  return {
    capsuleVersion: 1,
    eventId: event.eventId,
    receiptId: receipt.receiptId,
    generatedAt: receipt.generatedAt,
    dataMode: receipt.dataMode,
    asset: receipt.asset,
    representations: receipt.representations.map((r) => ({
      cryptoId: r.cryptoId,
      symbol: r.symbol,
      name: r.name,
      issuerName: r.issuerName,
    })),
    observed: {
      divergencePct: event.latestDeviationPct,
      peakDeviationPct: event.maxDeviationPct,
      referenceState: receipt.freshness.referenceState,
      aggregateFreshness: receipt.freshness.aggregateState,
      aggregateAgeSeconds: receipt.freshness.aggregateAgeSeconds,
      underlyingMarket: receipt.freshness.underlyingMarket,
      marketHoursHeuristic: receipt.freshness.marketHoursHeuristic,
      dispersionPct: receipt.metrics.dispersion.dispersionPct,
      wrapperCount: receipt.metrics.dispersion.wrapperCount,
    },
    lifecycle: {
      status: event.status,
      kind: event.kind,
      classification: event.classification,
      severity: event.severity,
      firstSeenAt: event.firstSeenAt,
      lastSeenAt: event.lastSeenAt,
      resolvedAt: event.resolvedAt,
      confirmations: event.confirmations,
      durationMs: input.stats?.durationMs ?? 0,
      recurrences: input.stats?.recurrences ?? 0,
    },
    claims: receipt.claims.map((c) => ({ kind: c.kind, statement: c.statement })),
    claimSummary,
    limitations: receipt.limitations,
    provenance: receipt.provenance.map((p) => ({
      endpoint: p.endpoint,
      retrievedAt: p.retrievedAt,
      dataMode: p.dataMode,
      requestId: p.requestId,
    })),
    integrity: {
      receiptHash: receipt.receiptHash,
      signature: receipt.signature
        ? { alg: receipt.signature.alg, publicKey: receipt.signature.publicKey }
        : null,
      signed: Boolean(receipt.signature),
      verification: {
        ok: verification.ok,
        schemaOk: verification.schemaOk,
        hashOk: verification.hashOk,
        signatureOk: verification.signatureOk ?? null,
        errors: verification.errors,
      },
    },
    receipt,
  };
}
