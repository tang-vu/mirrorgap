import { z } from "zod";
import { createHash } from "node:crypto";
import { canonicalJson, roundForHash } from "./canonical.js";
import type { IntegritySnapshot } from "./domain/results.js";
import type { Observation } from "./domain/observations.js";
import type { RwaAsset, TokenRepresentation } from "./domain/entities.js";

/** An analyst-supplied quote, never relabelled as CMC or independently authenticated. */
export const UnderlyingQuoteSchema = z
  .object({
    rwaId: z.number().int().positive(),
    price: z.number().finite().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    unit: z.string().trim().min(1).max(80),
    observedAt: z.string().datetime(),
    source: z.string().trim().min(1).max(160),
    sourceUrl: z
      .string()
      .url()
      .max(500)
      .refine((v) => {
        const u = new URL(v);
        return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
      }, "Use an HTTPS source URL without credentials, query parameters or fragments"),
    dataMode: z.enum(["live", "fixture"]),
    mappings: z
      .array(
        z
          .object({
            cryptoId: z.number().int().positive(),
            underlyingUnitsPerToken: z.number().finite().positive().max(1e12),
          })
          .strict(),
      )
      .min(1)
      .max(250),
  })
  .strict()
  .refine(
    (q) => new Set(q.mappings.map((m) => m.cryptoId)).size === q.mappings.length,
    "Each wrapper must have exactly one unit mapping",
  );
export type UnderlyingQuote = z.infer<typeof UnderlyingQuoteSchema>;

export interface WorkbenchInput {
  asset: RwaAsset;
  snapshot: IntegritySnapshot;
  observations: Observation[];
  representations: TokenRepresentation[];
  dataMode: "live" | "fixture";
  now: Date;
  maxAgeSeconds: number;
  underlying?: UnderlyingQuote;
}

/** Pure, snapshot-bound review. Never fetches a supplied URL or executes a trade. */
export function buildWorkbench(input: WorkbenchInput) {
  const { asset, snapshot, now } = input;
  const observations = input.observations.filter(
    (o) => o.rwaId === asset.rwaId && snapshot.observationIds.includes(o.observationId),
  );
  const ref = observations.find((o) => o.kind === "tokenized_aggregate");
  const tokens = observations.filter((o) => o.kind === "token");
  const ageSeconds = (now.getTime() - Date.parse(snapshot.measuredAt)) / 1000;
  const blockers: string[] = [];
  const nextSteps: string[] = [];
  if (observations.length !== snapshot.observationIds.length)
    blockers.push("Snapshot evidence is incomplete or has been pruned.");
  if (ageSeconds < 0 || ageSeconds > input.maxAgeSeconds) {
    blockers.push(
      "Snapshot is outside the review freshness window; historical evidence is not a current signal.",
    );
    nextSteps.push("Run a new CMC scan before using this as current market context.");
  }
  if (!ref) blockers.push("No tokenized aggregate observation is available.");
  if (snapshot.reference.aggregateFreshness.state !== "fresh")
    blockers.push("Aggregate was not fresh at scan time.");
  if (observations.some((o) => o.provenance.dataMode !== input.dataMode))
    blockers.push("Observation data modes do not match this review.");
  const wrappers = tokens
    .map((token) => {
      const peers = tokens
        .filter((t) => t.cryptoId !== token.cryptoId && t.currency === token.currency)
        .map((t) => t.price)
        .sort((a, b) => a - b);
      const mid = Math.floor(peers.length / 2);
      const peerMedian = peers.length
        ? peers.length % 2
          ? peers[mid]!
          : (peers[mid - 1]! + peers[mid]!) / 2
        : null;
      const rep = input.representations.find((r) => r.cryptoId === token.cryptoId);
      return {
        cryptoId: token.cryptoId,
        symbol: token.tokenSymbol,
        issuer: rep?.issuerName ?? null,
        price: token.price,
        currency: token.currency,
        observationId: token.observationId,
        timestampSource: token.timestampSource,
        observedAt: token.observedAt,
        aggregateGapPct: ref && ref.currency === token.currency ? pct(token.price, ref.price) : null,
        peerCount: peers.length,
        peerMedian,
        peerGapPct: peerMedian === null ? null : pct(token.price, peerMedian),
        peerAgreement: peers.length < 2 ? "insufficient_peers" : "descriptive_only",
      };
    })
    .sort((a, b) => Math.abs(b.peerGapPct ?? 0) - Math.abs(a.peerGapPct ?? 0) || a.cryptoId - b.cryptoId);
  const missingSourceTimes = tokens.some((t) => t.timestampSource !== "source");
  if (missingSourceTimes)
    nextSteps.push(
      "Obtain per-wrapper source timestamps; retrieval time cannot establish simultaneous prices.",
    );
  nextSteps.push("Check executable venue quotes and issuer redemption terms before attributing a cause.");
  const quote = input.underlying ? UnderlyingQuoteSchema.parse(input.underlying) : null;
  const underlying = quote
    ? {
        attribution: "analyst_supplied_not_authenticated" as const,
        quote,
        comparisons: wrappers.map((w) => {
          const mapping = quote.mappings.find((m) => m.cryptoId === w.cryptoId);
          const reasons: string[] = [];
          if (observations.length !== snapshot.observationIds.length)
            reasons.push("incomplete_snapshot_evidence");
          if (observations.some((o) => o.provenance.dataMode !== input.dataMode))
            reasons.push("inconsistent_observation_mode");
          if (quote.rwaId !== asset.rwaId) reasons.push("asset_mismatch");
          if (quote.dataMode !== input.dataMode) reasons.push("data_mode_mismatch");
          if (quote.currency !== w.currency) reasons.push("currency_mismatch");
          if (!mapping) reasons.push("unit_mapping_missing");
          const quoteAge = (now.getTime() - Date.parse(quote.observedAt)) / 1000;
          if (quoteAge < 0 || quoteAge > input.maxAgeSeconds) reasons.push("underlying_quote_not_current");
          if (ageSeconds < 0 || ageSeconds > input.maxAgeSeconds) reasons.push("snapshot_not_current");
          if (Math.abs(Date.parse(quote.observedAt) - Date.parse(w.observedAt)) > input.maxAgeSeconds * 1000)
            reasons.push("timestamps_not_aligned");
          if (!["open", "continuous"].includes(snapshot.reference.underlyingMarket))
            reasons.push("underlying_market_not_open");
          const mappedPrice = mapping ? quote.price * mapping.underlyingUnitsPerToken : null;
          if (mappedPrice !== null && (!Number.isFinite(mappedPrice) || mappedPrice <= 0))
            reasons.push("invalid_mapped_price");
          return {
            cryptoId: w.cryptoId,
            symbol: w.symbol,
            status: reasons.length ? "blocked" : "indicative",
            expectedTokenPrice: reasons.length ? null : mappedPrice,
            gapPct: reasons.length || mappedPrice === null ? null : pct(w.price, mappedPrice),
            reasons,
            limitations: [
              "Source and conversion ratio are supplied by the analyst, not independently verified.",
              ...(w.timestampSource === "retrieval"
                ? ["Wrapper source timestamp is unknown; simultaneity is unproven."]
                : []),
            ],
          };
        }),
      }
    : null;
  if (!quote)
    nextSteps.unshift(
      "Supply an independent underlying quote and explicit units per token to test the underlying-price hypothesis.",
    );
  const body = {
    schema: "mirrorgap.workbench.v1" as const,
    dataMode: input.dataMode,
    evaluatedAt: now.toISOString(),
    measuredAt: snapshot.measuredAt,
    snapshotId: snapshot.snapshotId,
    asset,
    disposition: blockers.length
      ? "refresh_evidence"
      : snapshot.severity === "none"
        ? "monitor"
        : "investigate",
    headline: blockers.length
      ? "Refresh evidence before drawing a current conclusion."
      : snapshot.severity === "none"
        ? "No threshold breach in this snapshot; underlying parity remains unproven."
        : "Wrapper disagreement needs investigation; it does not establish an underlying depeg.",
    comparisonBasis: "CMC tokenized aggregate and other wrappers; not an independent underlying price.",
    policy: {
      maxAgeSeconds: input.maxAgeSeconds,
      peerFormula: "leave_one_out_median_v1",
      gapFormula: "(price/reference - 1) * 100",
    },
    blockers,
    wrappers,
    underlying,
    agentPolicy: {
      maySummarizeEvidence: blockers.length === 0,
      mayAssertUnderlyingParity: false,
      mayExecuteTrade: false,
    },
    nextSteps: [...new Set(nextSteps)],
    limitations: [
      "Peer prices share one CMC provider; agreement is not independent corroboration.",
      "With two wrappers, disagreement cannot identify which wrapper is wrong.",
      "A hash proves bundle integrity, not source authenticity, backing, redemption or investment safety.",
    ],
    evidence: observations,
  };
  return { ...body, reportHash: "sha256:" + createHash("sha256").update(canonicalJson(body)).digest("hex") };
}

function pct(price: number, reference: number): number {
  return roundForHash(((price - reference) / reference) * 100, 6);
}
