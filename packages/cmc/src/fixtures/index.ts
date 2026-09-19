import type {
  Capability,
  CmcResult,
  RwaDataSource,
  RwaIdentifier,
  RwaInfoEntry,
  RwaIssuerListEntry,
  RwaListEntry,
  RwaMapEntry,
  RwaMarketPair,
  RwaQuotesEntry,
} from "../adapter.js";
import type { RwaIssuerResponse, KeyInfoResponse } from "../schemas.js";
import { CmcError } from "../errors.js";
import {
  FIXTURE_ISSUERS,
  fixtureIssuerDetail,
  fixtureMap,
  materializeFixtures,
  type FixtureQuotesEntry,
} from "./data.js";

/**
 * Deterministic fixture data source — same contract as the live CMC adapter.
 * Clearly marked `mode: "fixture"` in every provenance record so fixture
 * output can never be confused with live data downstream.
 *
 * Scenarios (`MIRRORGAP_FIXTURE_SCENARIO`):
 *   - "static"          fixed prices — every scan sees identical data
 *   - "incident_cycle"  (default) NVDA follows a scripted divergence arc, one
 *                       tick per scan, producing real anomaly lifecycles
 *
 * `advance(now)` is called once per scan by the runtime: it bumps the tick
 * and pins the fixture clock so retrieval timestamps match the scan's time
 * base (essential for deterministic seeded history).
 */
export class FixtureDataSource implements RwaDataSource {
  readonly mode = "fixture" as const;
  private tick = -1;
  private nowOverride: Date | null = null;
  private readonly scenario: string;

  constructor(opts: { scenario?: string } = {}) {
    this.scenario = opts.scenario ?? "incident_cycle";
  }

  get currentTick(): number {
    return Math.max(0, this.tick);
  }

  advance(now?: Date): void {
    this.tick += 1;
    if (now) this.nowOverride = now;
  }

  private now(): Date {
    return this.nowOverride ?? new Date();
  }

  private prov(endpoint: string, params: Record<string, string | number | boolean>) {
    return {
      endpoint,
      params,
      retrievedAt: this.now().toISOString(),
      requestId: `fixture:t${this.currentTick}`,
      dataMode: "fixture" as const,
      creditCount: 0,
    };
  }

  private ok<T>(endpoint: string, params: Record<string, string | number | boolean>, data: T): CmcResult<T> {
    return { data, provenance: this.prov(endpoint, params), cacheHit: false, creditCount: 0 };
  }

  capabilities(): { marketPairs: Capability } {
    // Fixture simulates a Startup plan: market-pairs is unavailable.
    return { marketPairs: "no" };
  }

  async listRwaMap(opts: { assetType?: string; symbol?: string[] } = {}): Promise<CmcResult<RwaMapEntry[]>> {
    let entries = fixtureMap(this.now());
    if (opts.assetType) entries = entries.filter((e) => e.asset_type === opts.assetType);
    if (opts.symbol?.length) {
      const wanted = new Set(opts.symbol.map((s) => s.toUpperCase()));
      entries = entries.filter((e) => wanted.has(e.symbol.toUpperCase()));
    }
    return this.ok(
      "/v5/real-world-assets/map",
      opts.symbol?.length
        ? { symbol: opts.symbol.join(",") }
        : opts.assetType
          ? { asset_type: opts.assetType }
          : {},
      entries,
    );
  }

  async getRwaInfo(id: RwaIdentifier): Promise<CmcResult<RwaInfoEntry[]>> {
    const assets = this.select<FixtureQuotesEntry>(id);
    return this.ok(
      "/v5/real-world-assets/info",
      this.idParams(id),
      assets.map((a) => ({
        name: a.name,
        symbol: a.symbol,
        slug: a.slug,
        website: a.website ?? null,
        employees: null,
        founded: null,
        industry: null,
        cik: null,
        about: a.description
          ? {
              description: a.description,
              logo: null,
              website: a.website ?? null,
              date_added: "2025-07-17T06:35:44.000Z",
            }
          : null,
        rwa_id: a.rwa_id,
        asset_type: a.asset_type,
        rwa_rank: a.rwa_rank ?? null,
        has_tokens: a.has_tokens ?? true,
        primary_exchange: a.primaryExchange ?? null,
      })),
    );
  }

  async listRwaAssets(opts: { assetType?: string } = {}): Promise<CmcResult<RwaListEntry[]>> {
    let assets = materializeFixtures(this.now(), this.currentTick, this.scenario);
    if (opts.assetType) assets = assets.filter((a) => a.asset_type === opts.assetType);
    return this.ok(
      "/v5/real-world-assets/assets/list",
      {},
      assets.map(({ quotes: _q, tokens: _t, tradfi_markets: _m, ...rest }) => rest),
    );
  }

  async getRwaQuotes(id: RwaIdentifier): Promise<CmcResult<RwaQuotesEntry[]>> {
    const all = materializeFixtures(this.now(), this.currentTick, this.scenario);
    const selected = this.select(id, all);
    return this.ok("/v5/real-world-assets/quotes/latest", this.idParams(id), selected);
  }

  async listIssuers(): Promise<CmcResult<RwaIssuerListEntry[]>> {
    return this.ok("/v5/real-world-assets/issuers/list", {}, FIXTURE_ISSUERS);
  }

  async getIssuer(issuerId: string): Promise<CmcResult<RwaIssuerResponse["data"]>> {
    const d = fixtureIssuerDetail(issuerId);
    if (!d) {
      throw new CmcError({
        kind: "bad_request",
        message: `Unknown issuer_id ${issuerId}`,
        endpoint: "/v5/real-world-assets/issuers",
        httpStatus: 400,
      });
    }
    return this.ok("/v5/real-world-assets/issuers", { issuer_id: issuerId }, d);
  }

  async getMarketPairs(
    id: RwaIdentifier,
  ): Promise<CmcResult<{ available: boolean; pairs: RwaMarketPair[] }>> {
    return this.ok("/v5/real-world-assets/market-pairs/list", this.idParams(id), {
      available: false,
      pairs: [],
    });
  }

  async getKeyInfo(): Promise<CmcResult<KeyInfoResponse["data"]>> {
    return this.ok(
      "/v1/key/info",
      {},
      {
        plan: { credit_limit_monthly: 0, rate_limit_minute: 0 },
        usage: {
          current_minute: { requests_made: 0, requests_left: 0 },
          current_day: { credits_used: 0, credits_left: 0 },
          current_month: { credits_used: 0, credits_left: 0 },
        },
      },
    );
  }

  private idParams(id: RwaIdentifier): Record<string, string> {
    if (id.rwaId) return { rwa_id: id.rwaId.join(",") };
    if (id.symbol) return { symbol: id.symbol.join(",") };
    if (id.slug) return { rwa_slug: id.slug.join(",") };
    return {};
  }

  private select<T extends { rwa_id: number; symbol: string; slug: string }>(
    id: RwaIdentifier,
    pool?: T[],
  ): T[] {
    const source = (pool ??
      materializeFixtures(this.now(), this.currentTick, this.scenario)) as unknown as T[];
    if (id.rwaId?.length) {
      const wanted = new Set(id.rwaId);
      return source.filter((a) => wanted.has(a.rwa_id));
    }
    if (id.symbol?.length) {
      const wanted = new Set(id.symbol.map((s) => s.toUpperCase()));
      return source.filter((a) => wanted.has(a.symbol.toUpperCase()));
    }
    if (id.slug?.length) {
      const wanted = new Set(id.slug);
      return source.filter((a) => wanted.has(a.slug));
    }
    return source;
  }
}
