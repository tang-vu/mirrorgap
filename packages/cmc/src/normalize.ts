import type {
  Provenance,
  ReferenceObservation,
  RwaAsset,
  TokenObservation,
  TokenRepresentation,
  TradfiMarketContext,
} from "@mirrorgap/core";
import type { RwaInfoEntry, RwaMapEntry, RwaQuotesEntry, RwaListEntry } from "./adapter.js";

/** map/info/list entries → canonical RwaAsset. `rwa_id` is the identity. */
export function toRwaAsset(e: RwaMapEntry | RwaInfoEntry | RwaListEntry | RwaQuotesEntry): RwaAsset {
  return {
    rwaId: e.rwa_id,
    symbol: e.symbol,
    name: e.name,
    slug: e.slug,
    assetType: e.asset_type,
    rwaRank: e.rwa_rank ?? null,
    hasTokens: e.has_tokens ?? true,
    primaryExchange: "primary_exchange" in e ? (e.primary_exchange ?? null) : null,
    website: "website" in e ? (e.website ?? null) : null,
    description: "about" in e && e.about ? (e.about.description ?? null) : null,
  };
}

/** quotes/latest tokens[] → TokenRepresentation (identity = crypto_id). */
export function toRepresentations(asset: RwaQuotesEntry): TokenRepresentation[] {
  return (asset.tokens ?? [])
    .filter((t) => t.crypto_id > 0)
    .map((t) => ({
      cryptoId: t.crypto_id,
      symbol: t.symbol,
      name: t.name ?? t.symbol,
      rwaId: asset.rwa_id,
      issuerId: t.issuer_id ?? null,
      issuerName: t.issuer_name ?? null,
    }));
}

/**
 * The tokenized aggregate (average_tokenized_price) becomes the reference
 * observation. `observedAt` comes from the quote's own `last_updated`
 * (timestampSource "source"); when absent we fall back to retrieval time and
 * say so (timestampSource "retrieval").
 */
export function toReferenceObservation(
  asset: RwaQuotesEntry,
  provenance: Provenance,
  currency = "USD",
): ReferenceObservation | null {
  const quote = (asset.quotes ?? []).find((q) => q.symbol === currency) ?? asset.quotes?.[0];
  const price = quote?.average_tokenized_price ?? asset.average_tokenized_price ?? null;
  if (price === null || !(price > 0)) return null;
  const lastUpdated = quote?.last_updated ?? asset.last_updated ?? null;
  const id = `obs:${asset.rwa_id}:ref:${quote?.crypto_id ?? 0}:${lastUpdated ?? provenance.retrievedAt}`;
  return {
    observationId: id,
    kind: "tokenized_aggregate",
    rwaId: asset.rwa_id,
    price,
    currency: quote?.symbol ?? currency,
    marketCap: quote?.tokenized_market_cap ?? asset.tokenized_market_cap ?? null,
    volume24h: quote?.tokenized_volume_24h ?? asset.tokenized_volume_24h ?? null,
    observedAt: lastUpdated ?? provenance.retrievedAt,
    timestampSource: lastUpdated ? "source" : "retrieval",
    provenance,
  };
}

/**
 * Per-token observations. The upstream payload carries no per-token
 * timestamp — observedAt is the retrieval time and timestampSource says so.
 * Tokens with missing/invalid prices are skipped by the caller via the
 * `skipped` list so the gap report can name them.
 */
export function toTokenObservations(
  asset: RwaQuotesEntry,
  provenance: Provenance,
  currency = "USD",
): { observations: TokenObservation[]; skipped: { cryptoId: number; reason: string }[] } {
  const observations: TokenObservation[] = [];
  const skipped: { cryptoId: number; reason: string }[] = [];
  for (const t of asset.tokens ?? []) {
    if (t.crypto_id <= 0) {
      skipped.push({ cryptoId: t.crypto_id, reason: "invalid crypto_id" });
      continue;
    }
    if (t.price === null || t.price === undefined || !(t.price > 0)) {
      skipped.push({ cryptoId: t.crypto_id, reason: "price missing or invalid upstream" });
      continue;
    }
    observations.push({
      observationId: `obs:${asset.rwa_id}:tok:${t.crypto_id}:${provenance.retrievedAt}`,
      kind: "token",
      rwaId: asset.rwa_id,
      cryptoId: t.crypto_id,
      price: t.price,
      currency,
      marketCap: t.market_cap ?? null,
      volume24h: t.volume_24h ?? null,
      observedAt: provenance.retrievedAt,
      timestampSource: "retrieval",
      provenance,
    });
  }
  return { observations, skipped };
}

export function toTradfiMarkets(asset: RwaQuotesEntry): TradfiMarketContext[] {
  return (asset.tradfi_markets ?? []).map((m) => ({
    exchangeSlug: m.exchange.slug,
    exchangeName: m.exchange.name,
    exchangeId: m.exchange.exchange_id,
    ticker: m.ticker,
    marketUrl: m.market_url ?? null,
  }));
}
