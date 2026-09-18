import { z } from "zod";
import { AssetTypeSchema } from "./enums.js";

/**
 * Domain identity conventions:
 *  - `rwaId`     CoinMarketCap's stable RWA identifier — canonical identity of
 *                the real-world asset. Never a symbol.
 *  - `cryptoId`  CoinMarketCap cryptocurrency id — identity of a *tokenized
 *                representation* of the asset, not the asset itself.
 *  - `issuerId`  24-char hex issuer id from the CMC RWA issuers endpoints.
 * Symbols are display/search conveniences only.
 */

export const RwaAssetSchema = z.object({
  rwaId: z.number().int().positive(),
  symbol: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  assetType: AssetTypeSchema,
  rwaRank: z.number().int().nonnegative().nullable(),
  hasTokens: z.boolean(),
  primaryExchange: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
export type RwaAsset = z.infer<typeof RwaAssetSchema>;

export const IssuerSchema = z.object({
  issuerId: z.string().regex(/^[0-9a-f]{24}$/, "issuer id is 24-char hex"),
  name: z.string().min(1),
  website: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
  numTokens: z.number().int().nonnegative().optional(),
});
export type Issuer = z.infer<typeof IssuerSchema>;

export const TokenRepresentationSchema = z.object({
  cryptoId: z.number().int().positive(),
  symbol: z.string().min(1),
  name: z.string().min(1),
  rwaId: z.number().int().positive(),
  issuerId: z
    .string()
    .regex(/^[0-9a-f]{24}$/)
    .nullable(),
  issuerName: z.string().nullable(),
});
export type TokenRepresentation = z.infer<typeof TokenRepresentationSchema>;

/**
 * Where the real-world asset trades in traditional finance, as reported by
 * CMC `tradfi_markets`. Context/provenance only — the API does not return a
 * TradFi price, so this can never be silently treated as a price reference.
 */
export const TradfiMarketContextSchema = z.object({
  exchangeSlug: z.string(),
  exchangeName: z.string(),
  exchangeId: z.number().int(),
  ticker: z.string(),
  marketUrl: z.string().nullable(),
});
export type TradfiMarketContext = z.infer<typeof TradfiMarketContextSchema>;
