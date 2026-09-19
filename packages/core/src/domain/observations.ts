import { z } from "zod";

/**
 * Provenance attached to every observation. `endpoint` is the CMC path,
 * `params` are the request parameters with secrets removed, `retrievedAt` is
 * when MirrorGap received the response, and `requestId` correlates logs.
 */
export const ProvenanceSchema = z.object({
  endpoint: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  retrievedAt: z.string().datetime(),
  requestId: z.string(),
  dataMode: z.enum(["live", "fixture"]),
  creditCount: z.number().int().nonnegative().nullable().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Whether the observation timestamp came from the upstream payload
 * (`source`) or had to fall back to the retrieval time (`retrieval`). CMC's
 * per-token entries inside quotes/latest carry no timestamp; treating
 * retrieval time as if it were a source timestamp would be fabrication, so
 * the distinction is preserved.
 */
export const TimestampSourceSchema = z.enum(["source", "retrieval"]);
export type TimestampSource = z.infer<typeof TimestampSourceSchema>;

const ObservationBase = {
  observationId: z.string(),
  currency: z.string().min(1),
  observedAt: z.string().datetime(),
  timestampSource: TimestampSourceSchema,
  provenance: ProvenanceSchema,
};

/**
 * Reference observation. The only reference price the CMC RWA API exposes is
 * the tokenized aggregate (`average_tokenized_price`) — CMC's consensus view
 * of what the tokenized asset is worth. `kind` makes the semantics explicit
 * so nothing downstream mistakes it for a TradFi quote.
 */
export const ReferenceObservationSchema = z.object({
  ...ObservationBase,
  kind: z.literal("tokenized_aggregate"),
  rwaId: z.number().int().positive(),
  price: z.number().positive(),
  marketCap: z.number().nonnegative().nullable(),
  volume24h: z.number().nonnegative().nullable(),
});
export type ReferenceObservation = z.infer<typeof ReferenceObservationSchema>;

/** Price observation for one tokenized representation (wrapper). */
export const TokenObservationSchema = z.object({
  ...ObservationBase,
  kind: z.literal("token"),
  rwaId: z.number().int().positive(),
  cryptoId: z.number().int().positive(),
  tokenSymbol: z.string().min(1),
  price: z.number().positive(),
  marketCap: z.number().nonnegative().nullable(),
  volume24h: z.number().nonnegative().nullable(),
});
export type TokenObservation = z.infer<typeof TokenObservationSchema>;

/**
 * Individual market-pair observation (per exchange/pair). Only reachable on
 * CMC Growth+ plans — when plan-gated this observation type is simply absent
 * and the limitation is surfaced, never faked.
 */
export const MarketObservationSchema = z.object({
  ...ObservationBase,
  kind: z.literal("market_pair"),
  rwaId: z.number().int().positive(),
  marketId: z.number().int(),
  exchangeSlug: z.string(),
  exchangeName: z.string(),
  pairSymbol: z.string(),
  baseCryptoId: z.number().int().positive(),
  quoteCryptoId: z.number().int().positive().nullable(),
  price: z.number().positive(),
  volume24h: z.number().nonnegative().nullable(),
});
export type MarketObservation = z.infer<typeof MarketObservationSchema>;

export const ObservationSchema = z.discriminatedUnion("kind", [
  ReferenceObservationSchema,
  TokenObservationSchema,
  MarketObservationSchema,
]);
export type Observation = z.infer<typeof ObservationSchema>;
