import { z } from "zod";

/**
 * Zod schemas for the CMC RWA API response shapes, derived from the official
 * documentation (verified 2026-09-18). Remote JSON is never trusted — every
 * response passes through these validators at the boundary.
 */

export const ApiStatusSchema = z.object({
  timestamp: z.string(),
  error_code: z.number().nullable(),
  error_message: z.string().nullable(),
  elapsed: z.number().nullable().optional(),
  credit_count: z.number().nullable().optional(),
  notice: z.string().nullable().optional(),
});
export type ApiStatus = z.infer<typeof ApiStatusSchema>;

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data: data.nullable().optional(), status: ApiStatusSchema });

// ---- /v5/real-world-assets/map ------------------------------------------------

export const RwaMapEntrySchema = z.object({
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  rwa_id: z.number().int(),
  asset_type: z.enum(["stock", "commodity", "currency", "government_security", "etf", "real_estate"]),
  rwa_rank: z.number().int().nullable().optional(),
  has_tokens: z.boolean().optional(),
  first_historical_data: z.string().nullable().optional(),
  last_historical_data: z.string().nullable().optional(),
});
export const RwaMapResponseSchema = envelope(
  z.object({
    rwa_assets: z.array(RwaMapEntrySchema),
    total_size: z.number().int().optional(),
    has_more: z.boolean().optional(),
  }),
);
export type RwaMapResponse = z.infer<typeof RwaMapResponseSchema>;

// ---- /v5/real-world-assets/info ------------------------------------------------

export const RwaInfoEntrySchema = z.object({
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  website: z.string().nullable().optional(),
  employees: z.number().nullable().optional(),
  founded: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  cik: z.string().nullable().optional(),
  about: z
    .object({
      description: z.string().nullable().optional(),
      logo: z.string().nullable().optional(),
      website: z.string().nullable().optional(),
      date_added: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  rwa_id: z.number().int(),
  asset_type: z.enum(["stock", "commodity", "currency", "government_security", "etf", "real_estate"]),
  rwa_rank: z.number().int().nullable().optional(),
  has_tokens: z.boolean().optional(),
  primary_exchange: z.string().nullable().optional(),
});
export const RwaInfoResponseSchema = envelope(z.object({ rwa_assets: z.array(RwaInfoEntrySchema) }));
export type RwaInfoResponse = z.infer<typeof RwaInfoResponseSchema>;

// ---- shared quote shape --------------------------------------------------------

export const RwaAggregateQuoteSchema = z.object({
  symbol: z.string(),
  crypto_id: z.number().int(),
  average_tokenized_price: z.number().nullable().optional(),
  tokenized_market_cap: z.number().nullable().optional(),
  tokenized_volume_24h: z.number().nullable().optional(),
  last_updated: z.string().nullable().optional(),
});

// ---- /v5/real-world-assets/assets/list ------------------------------------------

export const RwaListEntrySchema = z.object({
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  quotes: z.array(RwaAggregateQuoteSchema).optional(),
  rwa_id: z.number().int(),
  asset_type: z.enum(["stock", "commodity", "currency", "government_security", "etf", "real_estate"]),
  rwa_rank: z.number().int().nullable().optional(),
  has_tokens: z.boolean().optional(),
  average_tokenized_price: z.number().nullable().optional(),
  tokenized_market_cap: z.number().nullable().optional(),
  tokenized_volume_24h: z.number().nullable().optional(),
  last_updated: z.string().nullable().optional(),
});
export const RwaListResponseSchema = envelope(
  z.object({
    total_size: z.number().int().optional(),
    has_more: z.boolean().optional(),
    rwa_assets: z.array(RwaListEntrySchema),
  }),
);
export type RwaListResponse = z.infer<typeof RwaListResponseSchema>;

// ---- /v5/real-world-assets/quotes/latest -----------------------------------------

export const RwaTokenSchema = z.object({
  symbol: z.string(),
  name: z.string().optional(),
  price: z.number().nullable().optional(),
  crypto_id: z.number().int(),
  issuer_id: z.string().nullable().optional(),
  issuer_name: z.string().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  volume_24h: z.number().nullable().optional(),
});
export type RwaToken = z.infer<typeof RwaTokenSchema>;

export const RwaTradfiMarketSchema = z.object({
  exchange: z.object({
    slug: z.string(),
    name: z.string(),
    exchange_id: z.number().int(),
  }),
  ticker: z.string(),
  market_url: z.string().nullable().optional(),
});
export type RwaTradfiMarket = z.infer<typeof RwaTradfiMarketSchema>;

export const RwaQuotesEntrySchema = z.object({
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  quotes: z.array(RwaAggregateQuoteSchema).optional(),
  rwa_id: z.number().int(),
  asset_type: z.enum(["stock", "commodity", "currency", "government_security", "etf", "real_estate"]),
  rwa_rank: z.number().int().nullable().optional(),
  has_tokens: z.boolean().optional(),
  average_tokenized_price: z.number().nullable().optional(),
  tokenized_market_cap: z.number().nullable().optional(),
  tokenized_volume_24h: z.number().nullable().optional(),
  last_updated: z.string().nullable().optional(),
  tokens: z.array(RwaTokenSchema).nullable().optional(),
  tradfi_markets: z.array(RwaTradfiMarketSchema).nullable().optional(),
});
export const RwaQuotesResponseSchema = envelope(z.object({ rwa_assets: z.array(RwaQuotesEntrySchema) }));
export type RwaQuotesResponse = z.infer<typeof RwaQuotesResponseSchema>;

// ---- /v5/real-world-assets/issuers/list ------------------------------------------

export const RwaIssuerListEntrySchema = z.object({
  name: z.string(),
  website: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
  issuer_id: z.string(),
  num_tokens: z.number().int().optional(),
});
export const RwaIssuersListResponseSchema = envelope(
  z.object({
    issuers: z.array(RwaIssuerListEntrySchema),
    total_size: z.number().int().optional(),
    has_more: z.boolean().optional(),
  }),
);
export type RwaIssuersListResponse = z.infer<typeof RwaIssuersListResponseSchema>;

// ---- /v5/real-world-assets/issuers ------------------------------------------------

export const RwaIssuerTokenSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  crypto_id: z.number().int(),
  rwa_id: z.number().int(),
});
export const RwaIssuerResponseSchema = envelope(
  z.object({
    name: z.string(),
    website: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    tokens: z.array(RwaIssuerTokenSchema).optional(),
    issuer_id: z.string(),
    num_tokens: z.number().int().optional(),
    total_size: z.number().int().optional(),
    has_more: z.boolean().optional(),
  }),
);
export type RwaIssuerResponse = z.infer<typeof RwaIssuerResponseSchema>;

// ---- /v5/real-world-assets/market-pairs/list (Growth+ plans only) ------------------

export const RwaMarketPairSchema = z.object({
  exchange: z.object({
    exchange_id: z.number().int(),
    name: z.string(),
    slug: z.string(),
  }),
  market_id: z.number().int(),
  market_pair: z.string(),
  category: z.string().optional(),
  market_pair_base: z.object({
    crypto_id: z.number().int(),
    symbol: z.string(),
    exchange_symbol: z.string().optional(),
    currency_type: z.string().optional(),
  }),
  market_pair_quote: z.object({
    crypto_id: z.number().int().nullable().optional(),
    symbol: z.string(),
    exchange_symbol: z.string().optional(),
    currency_type: z.string().optional(),
  }),
  quotes: z
    .array(
      z.object({
        crypto_id: z.number().int(),
        symbol: z.string(),
        price: z.number().nullable().optional(),
        volume_24h: z.number().nullable().optional(),
        last_updated: z.string().nullable().optional(),
      }),
    )
    .optional(),
});
export const RwaMarketPairsResponseSchema = envelope(
  z.object({
    rwa_id: z.number().int(),
    name: z.string().optional(),
    symbol: z.string().optional(),
    num_market_pairs: z.number().int().optional(),
    market_pairs: z.array(RwaMarketPairSchema),
    total_size: z.number().int().optional(),
    has_more: z.boolean().optional(),
  }),
);
export type RwaMarketPairsResponse = z.infer<typeof RwaMarketPairsResponseSchema>;

// ---- /v1/key/info -----------------------------------------------------------------

export const KeyInfoResponseSchema = envelope(
  z.object({
    plan: z.object({
      credit_limit_monthly: z.number(),
      credit_limit_monthly_reset: z.string().optional(),
      credit_limit_monthly_reset_timestamp: z.string().optional(),
      rate_limit_minute: z.number(),
    }),
    usage: z.object({
      current_minute: z.object({ requests_made: z.number(), requests_left: z.number() }),
      current_day: z.object({ credits_used: z.number(), credits_left: z.number() }),
      current_month: z.object({ credits_used: z.number(), credits_left: z.number() }),
    }),
  }),
);
export type KeyInfoResponse = z.infer<typeof KeyInfoResponseSchema>;
