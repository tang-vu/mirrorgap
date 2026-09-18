import { z } from "zod";

/** RWA asset types as defined by the CoinMarketCap RWA API. */
export const AssetTypeSchema = z.enum([
  "stock",
  "commodity",
  "currency",
  "government_security",
  "etf",
  "real_estate",
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

/** Freshness of a single observation relative to its retrieval time. */
export const FreshnessStateSchema = z.enum(["fresh", "aging", "stale", "unavailable"]);
export type FreshnessState = z.infer<typeof FreshnessStateSchema>;

/**
 * State of the underlying traditional-finance market for an asset.
 * `open`/`closed` are only ever asserted via an explicit, versioned heuristic
 * (`us_regular_session_v1`); otherwise we report `unknown` rather than guess.
 * `continuous` means the observed market trades around the clock.
 */
export const MarketStateSchema = z.enum(["open", "closed", "continuous", "unknown"]);
export type MarketState = z.infer<typeof MarketStateSchema>;

/** Overall reference-state classification for a comparison. */
export const ReferenceStateSchema = z.enum([
  "fresh",
  "aging",
  "stale",
  "market_closed",
  "unavailable",
  "incomparable",
]);
export type ReferenceState = z.infer<typeof ReferenceStateSchema>;

/** Anomaly severity bands (percent-based, configurable). */
export const SeveritySchema = z.enum(["none", "info", "watch", "high", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

/** Lifecycle of an anomaly event. */
export const EventStatusSchema = z.enum(["candidate", "confirmed", "resolved", "invalidated"]);
export type EventStatus = z.infer<typeof EventStatusSchema>;

/** What kind of divergence the event describes. */
export const EventKindSchema = z.enum(["parity_gap", "cross_wrapper_dispersion"]);
export type EventKind = z.infer<typeof EventKindSchema>;

/**
 * A `parity_gap` is verified against a fresh reference. A `price_difference`
 * is a real observed difference that cannot be presented as a live parity
 * anomaly because the reference is aging/stale or the underlying market is
 * closed. This distinction is a core product guarantee.
 */
export const EventClassificationSchema = z.enum(["parity_gap", "price_difference"]);
export type EventClassification = z.infer<typeof EventClassificationSchema>;

/** Claim kinds inside an investigation's claim ledger. */
export const ClaimKindSchema = z.enum(["observed", "derived", "supported_hypothesis", "unknown"]);
export type ClaimKind = z.infer<typeof ClaimKindSchema>;

/** Data provenance mode. */
export const DataModeSchema = z.enum(["live", "fixture"]);
export type DataMode = z.infer<typeof DataModeSchema>;
