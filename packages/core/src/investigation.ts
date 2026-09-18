import type { AnomalyEvent, EvidenceClaim, IntegritySnapshot, Investigation } from "./domain/results.js";
import type { RwaAsset, TokenRepresentation, TradfiMarketContext } from "./domain/entities.js";
import type { ReferenceObservation, TokenObservation } from "./domain/observations.js";
import { FORMULA_PARITY_GAP } from "./parity.js";
import { FORMULA_DISPERSION } from "./dispersion.js";
import { FORMULA_DATA_QUALITY } from "./quality.js";

/**
 * Investigation builder — turns a confirmed anomaly snapshot into a claim
 * ledger. Rules that keep the product honest:
 *
 *  - `observed` claims only cite fields directly present in evidence.
 *  - `derived` claims must name a formula id and its input evidence ids.
 *  - `supported_hypothesis` claims may only be emitted by the deterministic
 *    rules below — they always name their supporting signals and always say
 *    causality is not established.
 *  - `unknown` claims record what would be needed for stronger conclusions.
 *
 * An optional LLM layer can rephrase `supported_hypothesis` text later, but
 * it can never create claims or edit numbers (see llm.ts).
 */
export function buildInvestigation(input: {
  investigationId: string;
  event: AnomalyEvent;
  snapshot: IntegritySnapshot;
  asset: RwaAsset;
  reference: ReferenceObservation | null;
  tokens: TokenObservation[];
  representations: TokenRepresentation[];
  tradfiMarkets: TradfiMarketContext[];
  marketPairsAvailable: boolean | null;
  now: Date;
}): Investigation {
  const { event, snapshot, asset } = input;
  const claims: EvidenceClaim[] = [];
  const limitations: string[] = [];
  let n = 0;
  const claim = (c: Omit<EvidenceClaim, "claimId">) => {
    n += 1;
    claims.push({ claimId: `claim_${n}`, ...c });
  };

  // ---- OBSERVED -----------------------------------------------------------
  if (input.reference) {
    const r = input.reference;
    claim({
      kind: "observed",
      statement:
        `The tokenized aggregate for ${asset.name} (${asset.symbol}) was observed at ` +
        `${fmt(r.price)} ${r.currency} via ${r.provenance.endpoint} ` +
        `(last_updated ${r.observedAt}, retrieved ${r.provenance.retrievedAt}).`,
      evidenceIds: [r.observationId],
    });
  }

  for (const t of input.tokens) {
    const rep = input.representations.find((x) => x.cryptoId === t.cryptoId);
    const issuer = rep?.issuerName ?? "unknown issuer";
    const vol = t.volume24h === null ? "volume not reported" : `24h volume ${fmt(t.volume24h)} ${t.currency}`;
    claim({
      kind: "observed",
      statement:
        `Representation ${rep?.symbol ?? t.cryptoId} (${rep?.name ?? "token"}, issuer: ${issuer}) ` +
        `was observed at ${fmt(t.price)} ${t.currency}; ${vol}.`,
      evidenceIds: [t.observationId],
    });
  }

  if (input.tradfiMarkets.length > 0) {
    const venues = input.tradfiMarkets.map((m) => `${m.exchangeName} (${m.ticker})`).join(", ");
    claim({
      kind: "observed",
      statement: `CMC reports the underlying trades on: ${venues}. No TradFi price is provided by this endpoint.`,
      evidenceIds: input.tradfiMarkets.map((m) => `tradfi:${m.exchangeSlug}:${m.ticker}`),
    });
  }

  claim({
    kind: "observed",
    statement: `Reference context: ${snapshot.reference.state} — ${snapshot.reference.explanations.join(" ")}`,
    evidenceIds: input.reference ? [input.reference.observationId] : [],
  });

  // ---- DERIVED ------------------------------------------------------------
  for (const g of snapshot.gaps) {
    claim({
      kind: "derived",
      statement:
        `${g.tokenSymbol} deviates ${signed(g.gapPct)}% from the tokenized aggregate ` +
        `(${fmt(g.tokenPrice)} vs ${fmt(g.referencePrice)} ${g.currency}).`,
      evidenceIds: input.reference ? [input.reference.observationId] : [],
      formulaId: FORMULA_PARITY_GAP,
      inputs: [String(g.cryptoId), input.reference?.observationId ?? "no-reference"],
    });
  }

  if (snapshot.dispersion.dispersionPct !== null) {
    claim({
      kind: "derived",
      statement:
        `Cross-wrapper dispersion is ${fmt(snapshot.dispersion.dispersionPct)}% across ` +
        `${snapshot.dispersion.wrapperCount} representations ` +
        `(${snapshot.dispersion.minTokenSymbol} ${fmt(snapshot.dispersion.minPrice ?? 0)} ↔ ` +
        `${snapshot.dispersion.maxTokenSymbol} ${fmt(snapshot.dispersion.maxPrice ?? 0)}).`,
      evidenceIds: input.tokens.map((t) => t.observationId),
      formulaId: FORMULA_DISPERSION,
      inputs: input.tokens.map((t) => t.observationId),
    });
  }

  claim({
    kind: "derived",
    statement:
      `Severity ${event.severity.toUpperCase()}, classified as ${event.classification === "parity_gap" ? "a verified parity gap" : "a price difference (not a verified live parity gap)"}; ` +
      `data quality ${snapshot.dataQuality.score.toFixed(2)} from ${snapshot.dataQuality.factors.length} transparent factors.`,
    evidenceIds: snapshot.observationIds,
    formulaId: FORMULA_DATA_QUALITY,
    inputs: snapshot.observationIds,
  });

  // ---- SUPPORTED HYPOTHESES (deterministic rules only) ---------------------
  // Rule: largest-deviating wrapper also shows materially lower 24h volume
  // than peers (< 50% of peer median) → liquidity-consistent hypothesis.
  const volumes = input.tokens.map((t) => t.volume24h).filter((v): v is number => v !== null && v > 0);
  if (volumes.length >= 2) {
    const sortedVol = [...volumes].sort((a, b) => a - b);
    const medianVol = sortedVol[Math.floor(sortedVol.length / 2)]!;
    const widest = [...snapshot.gaps].sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))[0];
    if (widest) {
      const widestObs = input.tokens.find((t) => t.cryptoId === widest.cryptoId);
      if (widestObs?.volume24h && widestObs.volume24h < medianVol * 0.5) {
        claim({
          kind: "supported_hypothesis",
          statement:
            `${widest.tokenSymbol} shows the largest deviation (${signed(widest.gapPct)}%) and the lowest observed ` +
            `24h volume among peers (${fmt(widestObs.volume24h)} vs peer median ${fmt(medianVol)} ${widest.currency}). ` +
            `This is consistent with a liquidity-related explanation, but the available data cannot establish causality.`,
          evidenceIds: [widestObs.observationId, ...(input.reference ? [input.reference.observationId] : [])],
          inputs: input.tokens.map((t) => t.observationId),
        });
      }
    }
  }

  // Rule: market closed → price discovery hypothesis.
  if (snapshot.reference.state === "market_closed") {
    claim({
      kind: "supported_hypothesis",
      statement:
        `The underlying venue is closed (${input.snapshot.reference.underlyingDetail}). ` +
        `Tokenized representations trade continuously, so observed differences may reflect ` +
        `unsupported after-hours price discovery rather than a verified parity break.`,
      evidenceIds: input.reference ? [input.reference.observationId] : [],
    });
  }

  // ---- UNKNOWN -------------------------------------------------------------
  const unknown = (statement: string) => claim({ kind: "unknown", statement, evidenceIds: [] });

  if (input.tradfiMarkets.length > 0) {
    unknown(
      "The current TradFi reference price is not available from the observed dataset; " +
        "the tokenized aggregate is the strongest available reference.",
    );
  }
  if (input.tokens.some((t) => t.timestampSource === "retrieval")) {
    unknown(
      "Per-representation observation timestamps are not provided upstream; " +
        "retrieval time is used and temporal alignment cannot be fully verified.",
    );
  }
  if (input.marketPairsAvailable === null) {
    unknown(
      "Per-market-pair detail requires a higher CMC plan; liquidity structure of individual venues was not observable.",
    );
  }
  unknown(
    "Redemption status, issuer attestation, and on-chain backing are not observable from market data alone.",
  );
  if (snapshot.reference.marketHoursHeuristic) {
    unknown(
      `Market-hours state derives from heuristic ${snapshot.reference.marketHoursHeuristic} (US regular session only; early closes and non-US venues not modeled).`,
    );
  }

  return {
    investigationId: input.investigationId,
    eventId: event.eventId,
    createdAt: input.now.toISOString(),
    claims,
    limitations,
    narrator: "deterministic",
  };
}

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toPrecision(4));
const signed = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
