import type { Provenance, ReferenceObservation, TokenObservation } from "../src/domain/observations.js";
import type { RwaAsset } from "../src/domain/entities.js";

export const NOW = new Date("2026-09-18T15:00:00.000Z"); // Friday 11:00 ET — US session open

export function prov(overrides: Partial<Provenance> = {}): Provenance {
  return {
    endpoint: "/v5/real-world-assets/quotes/latest",
    params: { rwa_id: "2" },
    retrievedAt: NOW.toISOString(),
    requestId: "req_test",
    dataMode: "fixture",
    creditCount: 1,
    ...overrides,
  };
}

export function refObs(price: number, overrides: Partial<ReferenceObservation> = {}): ReferenceObservation {
  return {
    observationId: "obs:ref:1",
    kind: "tokenized_aggregate",
    rwaId: 2,
    price,
    currency: "USD",
    marketCap: 117_000_000,
    volume24h: 79_000_000,
    observedAt: new Date(NOW.getTime() - 30_000).toISOString(),
    timestampSource: "source",
    provenance: prov(),
    ...overrides,
  };
}

let tokSeq = 0;
export function tokObs(
  cryptoId: number,
  symbol: string,
  price: number,
  overrides: Partial<TokenObservation> = {},
): TokenObservation {
  tokSeq += 1;
  return {
    observationId: `obs:tok:${symbol}`,
    kind: "token",
    rwaId: 2,
    cryptoId,
    price,
    currency: "USD",
    marketCap: 39_000_000,
    volume24h: 12_000_000,
    observedAt: NOW.toISOString(),
    timestampSource: "retrieval",
    provenance: prov(),
    ...overrides,
  };
}

export function asset(overrides: Partial<RwaAsset> = {}): RwaAsset {
  return {
    rwaId: 2,
    symbol: "NVDA",
    name: "Nvidia Corp",
    slug: "nvidia",
    assetType: "stock",
    rwaRank: 2,
    hasTokens: true,
    primaryExchange: "Nasdaq",
    ...overrides,
  };
}
