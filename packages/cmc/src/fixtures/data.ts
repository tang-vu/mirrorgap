import type { RwaIssuerListEntry, RwaMapEntry, RwaQuotesEntry } from "../adapter.js";
import type { RwaIssuerResponse } from "../schemas.js";

/**
 * Deterministic synthetic fixture data — mirrors the verified CMC v5 RWA
 * response shapes. Used for development, tests, and the reproducible demo.
 * Every value is invented; nothing here is presented as live data.
 */

export const FIXTURE_ISSUERS: RwaIssuerListEntry[] = [
  {
    name: "Backed Assets",
    website: "https://assets.backed.fi/",
    logo: null,
    issuer_id: "6878977dcbbf471de3366e85",
    num_tokens: 147,
  },
  {
    name: "Ondo Assets",
    website: "https://ondo.finance",
    logo: null,
    issuer_id: "688ca4ccabae9b5b9fb3167a",
    num_tokens: 61,
  },
  {
    name: "Paxos",
    website: "https://paxos.com",
    logo: null,
    issuer_id: "68904c24abae9b5b9fb35815",
    num_tokens: 1,
  },
  {
    name: "Tether Holdings",
    website: "https://tether.to",
    logo: null,
    issuer_id: "68904e9cabae9b5b9fb358ac",
    num_tokens: 1,
  },
  {
    name: "Backpack",
    website: "https://backpack.exchange",
    logo: null,
    issuer_id: "6a2d54b697c45356b1a634f4",
    num_tokens: 1,
  },
];

interface FixtureAsset extends RwaQuotesEntry {
  primaryExchange?: string | null;
  website?: string | null;
  description?: string | null;
  /** Seconds before "now" used for the aggregate's last_updated. */
  staleSeconds?: number;
}

export const FIXTURE_ASSETS: FixtureAsset[] = [
  // 1 — aligned multi-wrapper commodity
  {
    rwa_id: 1,
    name: "Gold",
    symbol: "GOLD",
    slug: "gold",
    asset_type: "commodity",
    rwa_rank: 1,
    has_tokens: true,
    primaryExchange: null,
    website: null,
    description: "Physical gold commodity benchmark.",
    quotes: [],
    tokens: [
      {
        symbol: "PAXG",
        name: "PAX Gold",
        crypto_id: 4705,
        issuer_id: "68904c24abae9b5b9fb35815",
        issuer_name: "Paxos",
        price: 4404.15,
        market_cap: 1_904_813_029.99,
        volume_24h: 183_784_699.06,
      },
      {
        symbol: "XAUt",
        name: "Tether Gold",
        crypto_id: 5176,
        issuer_id: "68904e9cabae9b5b9fb358ac",
        issuer_name: "Tether Holdings",
        price: 4403.91,
        market_cap: 2_695_911_303.57,
        volume_24h: 201_510_910.11,
      },
    ],
    tradfi_markets: [],
    staleSeconds: 18,
  },
  // 2 — positive parity gap (HIGH)
  {
    rwa_id: 2,
    name: "Nvidia Corp",
    symbol: "NVDA",
    slug: "nvidia",
    asset_type: "stock",
    rwa_rank: 2,
    has_tokens: true,
    primaryExchange: "Nasdaq",
    website: "https://www.nvidia.com",
    description: "US semiconductor and accelerated-computing company.",
    quotes: [],
    tokens: [
      {
        symbol: "NVDAX",
        name: "NVIDIA tokenized stock (xStock)",
        crypto_id: 36992,
        issuer_id: "6878977dcbbf471de3366e85",
        issuer_name: "Backed Assets",
        price: 226.33,
        market_cap: 39_526_066.25,
        volume_24h: 12_187_859.27,
      },
      {
        symbol: "NVDAon",
        name: "NVIDIA Tokenized Stock (Ondo)",
        crypto_id: 38093,
        issuer_id: "688ca4ccabae9b5b9fb3167a",
        issuer_name: "Ondo Assets",
        price: 230.4,
        market_cap: 38_222_994.66,
        volume_24h: 2_634_471.7,
      },
    ],
    tradfi_markets: [
      {
        exchange: { slug: "binance", name: "Binance", exchange_id: 270 },
        ticker: "NVDA",
        market_url: "https://www.binance.com/en/stocks/EQ_NVDA",
      },
    ],
    staleSeconds: 22,
  },
  // 3 — negative parity gap (WATCH)
  {
    rwa_id: 3,
    name: "Tesla Inc",
    symbol: "TSLA",
    slug: "tesla",
    asset_type: "stock",
    rwa_rank: 3,
    has_tokens: true,
    primaryExchange: "Nasdaq",
    website: "https://www.tesla.com",
    description: "US electric-vehicle and clean-energy company.",
    quotes: [],
    tokens: [
      {
        symbol: "TSLAX",
        name: "Tesla tokenized stock (xStock)",
        crypto_id: 38101,
        issuer_id: "6878977dcbbf471de3366e85",
        issuer_name: "Backed Assets",
        price: 421.1,
        market_cap: 29_411_203.1,
        volume_24h: 9_812_333.4,
      },
      {
        symbol: "TSLAon",
        name: "Tesla Tokenized Stock (Ondo)",
        crypto_id: 38155,
        issuer_id: "688ca4ccabae9b5b9fb3167a",
        issuer_name: "Ondo Assets",
        price: 418.15,
        market_cap: 27_940_120.55,
        volume_24h: 4_105_902.2,
      },
    ],
    tradfi_markets: [],
    staleSeconds: 31,
  },
  // 4 — stale aggregate reference (aging → stale)
  {
    rwa_id: 4,
    name: "S&P 500 ETF",
    symbol: "SPY",
    slug: "sp-500-etf",
    asset_type: "etf",
    rwa_rank: 4,
    has_tokens: true,
    primaryExchange: "NYSE Arca",
    website: null,
    description: "ETF tracking the S&P 500 index.",
    quotes: [],
    tokens: [
      {
        symbol: "SPYx",
        name: "SPY tokenized fund (xStock)",
        crypto_id: 40210,
        issuer_id: "6878977dcbbf471de3366e85",
        issuer_name: "Backed Assets",
        price: 661.2,
        market_cap: 12_210_552.0,
        volume_24h: 3_400_201.9,
      },
      {
        symbol: "SPYon",
        name: "SPY Tokenized Fund (Ondo)",
        crypto_id: 40277,
        issuer_id: "688ca4ccabae9b5b9fb3167a",
        issuer_name: "Ondo Assets",
        price: 663.9,
        market_cap: 10_551_300.7,
        volume_24h: 2_030_551.1,
      },
    ],
    tradfi_markets: [],
    staleSeconds: 7_200, // aggregate last_updated 2h ago → stale
  },
  // 5 — market-closed style case (US venue; classification depends on run time)
  {
    rwa_id: 7,
    name: "Robinhood Markets",
    symbol: "HOOD",
    slug: "robinhood",
    asset_type: "stock",
    rwa_rank: 7,
    has_tokens: true,
    primaryExchange: "Nasdaq",
    website: "https://robinhood.com",
    description: "US retail brokerage.",
    quotes: [],
    tokens: [
      {
        symbol: "HOODX",
        name: "Robinhood tokenized stock (xStock)",
        crypto_id: 41011,
        issuer_id: "6878977dcbbf471de3366e85",
        issuer_name: "Backed Assets",
        price: 108.44,
        market_cap: 8_201_440.2,
        volume_24h: 2_200_118.6,
      },
      {
        symbol: "HOODon",
        name: "Robinhood Tokenized Stock (Ondo)",
        crypto_id: 41072,
        issuer_id: "688ca4ccabae9b5b9fb3167a",
        issuer_name: "Ondo Assets",
        price: 109.41,
        market_cap: 7_997_210.3,
        volume_24h: 1_120_010.5,
      },
    ],
    tradfi_markets: [],
    staleSeconds: 26,
  },
  // 6 — single-wrapper asset (cross-wrapper analysis not possible)
  {
    rwa_id: 9,
    name: "SpaceX",
    symbol: "SPCX",
    slug: "spacex",
    asset_type: "stock",
    rwa_rank: 9,
    has_tokens: true,
    primaryExchange: null,
    website: null,
    description: "Private aerospace company (pre-IPO reference).",
    quotes: [],
    tokens: [
      {
        symbol: "SPCX",
        name: "SpaceX tokenized stock (Backpack)",
        crypto_id: 40238,
        issuer_id: "6a2d54b697c45356b1a634f4",
        issuer_name: "Backpack",
        price: 212.9,
        market_cap: null,
        volume_24h: null,
      },
    ],
    tradfi_markets: [],
    staleSeconds: 40,
  },
  // 7 — missing optional fields (no website, null volume on one token)
  {
    rwa_id: 5,
    name: "Amazon.com Inc",
    symbol: "AMZN",
    slug: "amazon",
    asset_type: "stock",
    rwa_rank: 5,
    has_tokens: true,
    primaryExchange: "Nasdaq",
    website: null,
    description: null,
    quotes: [],
    tokens: [
      {
        symbol: "AMZNX",
        name: "Amazon tokenized stock (xStock)",
        crypto_id: 39871,
        issuer_id: "6878977dcbbf471de3366e85",
        issuer_name: "Backed Assets",
        price: 231.02,
        market_cap: 15_512_004.2,
        volume_24h: 6_312_770.4,
      },
      {
        symbol: "AMZNon",
        name: "Amazon Tokenized Stock (Ondo)",
        crypto_id: 39912,
        issuer_id: "688ca4ccabae9b5b9fb3167a",
        issuer_name: "Ondo Assets",
        price: 231.4,
        market_cap: 14_870_115.9,
        volume_24h: null,
      },
    ],
    tradfi_markets: [],
    staleSeconds: 25,
  },
];

export type FixtureQuotesEntry = RwaQuotesEntry & {
  primaryExchange?: string | null;
  website?: string | null;
  description?: string | null;
};

/** Fill the aggregate quote for each asset deterministically. */
export function materializeFixtures(now: Date): FixtureQuotesEntry[] {
  return FIXTURE_ASSETS.map((a) => {
    const priced = (a.tokens ?? []).filter((t) => typeof t.price === "number" && t.price > 0);
    const avg = priced.length > 0 ? priced.reduce((s, t) => s + (t.price ?? 0), 0) / priced.length : null;
    const mcap = (a.tokens ?? []).reduce((s, t) => s + (t.market_cap ?? 0), 0);
    const vol = (a.tokens ?? []).reduce((s, t) => s + (t.volume_24h ?? 0), 0);
    const lastUpdated = new Date(now.getTime() - (a.staleSeconds ?? 30) * 1000).toISOString();
    const { primaryExchange: _pe, website: _w, description: _d, staleSeconds: _s, ...rest } = a;
    return {
      ...rest,
      primaryExchange: a.primaryExchange ?? null,
      website: a.website ?? null,
      description: a.description ?? null,
      quotes: [
        {
          symbol: "USD",
          crypto_id: 2781,
          average_tokenized_price: avg,
          tokenized_market_cap: mcap || null,
          tokenized_volume_24h: vol || null,
          last_updated: lastUpdated,
        },
      ],
      average_tokenized_price: avg,
      tokenized_market_cap: mcap || null,
      tokenized_volume_24h: vol || null,
      last_updated: lastUpdated,
    };
  });
}

export function fixtureMap(now: Date): RwaMapEntry[] {
  return FIXTURE_ASSETS.map((a) => ({
    name: a.name,
    symbol: a.symbol,
    slug: a.slug,
    rwa_id: a.rwa_id,
    asset_type: a.asset_type,
    rwa_rank: a.rwa_rank ?? null,
    has_tokens: a.has_tokens ?? true,
    first_historical_data: null,
    last_historical_data: now.toISOString(),
  }));
}

export function fixtureIssuerDetail(issuerId: string): RwaIssuerResponse["data"] | null {
  const issuer = FIXTURE_ISSUERS.find((i) => i.issuer_id === issuerId);
  if (!issuer) return null;
  const tokens = FIXTURE_ASSETS.flatMap((a) =>
    (a.tokens ?? [])
      .filter((t) => t.issuer_id === issuerId)
      .map((t) => ({ name: t.name ?? t.symbol, symbol: t.symbol, crypto_id: t.crypto_id, rwa_id: a.rwa_id })),
  );
  return {
    name: issuer.name,
    website: issuer.website ?? null,
    logo: issuer.logo ?? null,
    tokens,
    issuer_id: issuer.issuer_id,
    num_tokens: tokens.length,
    total_size: tokens.length,
    has_more: false,
  };
}

/** Intentionally malformed payload for validation tests (scenario 9). */
export function malformedQuotesPayload(): unknown {
  return {
    data: {
      rwa_assets: [
        {
          rwa_id: "not-a-number",
          symbol: "BROKEN",
          tokens: [{ symbol: "BRK", price: "NaN-ish", crypto_id: "x" }],
        },
      ],
    },
    status: { timestamp: new Date().toISOString(), error_code: 0, error_message: null, credit_count: 1 },
  };
}
