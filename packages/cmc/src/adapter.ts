import type { z } from "zod";
import type { Provenance } from "@mirrorgap/core";
import { CmcError } from "./errors.js";
import { CMC_TTL } from "./cache.js";
import type { CmcClient } from "./client.js";
import type { DiagnosticsSink } from "./diagnostics.js";
import {
  KeyInfoResponseSchema,
  RwaInfoResponseSchema,
  RwaIssuerResponseSchema,
  RwaIssuersListResponseSchema,
  RwaListResponseSchema,
  RwaMapResponseSchema,
  RwaMarketPairsResponseSchema,
  RwaQuotesResponseSchema,
  type KeyInfoResponse,
  type RwaInfoEntrySchema,
  type RwaIssuerListEntrySchema,
  type RwaIssuerResponse,
  type RwaListEntrySchema,
  type RwaMapEntrySchema,
  type RwaMarketPairSchema,
  type RwaQuotesEntrySchema,
} from "./schemas.js";

export type RwaInfoEntry = z.infer<typeof RwaInfoEntrySchema>;
export type RwaMapEntry = z.infer<typeof RwaMapEntrySchema>;
export type RwaListEntry = z.infer<typeof RwaListEntrySchema>;
export type RwaQuotesEntry = z.infer<typeof RwaQuotesEntrySchema>;
export type RwaMarketPair = z.infer<typeof RwaMarketPairSchema>;
export type RwaIssuerListEntry = z.infer<typeof RwaIssuerListEntrySchema>;

export interface CmcResult<T> {
  data: T;
  provenance: Provenance;
  cacheHit: boolean;
  creditCount: number | null;
}

export type Capability = "yes" | "no" | "unknown";

export interface RwaIdentifier {
  rwaId?: number[];
  symbol?: string[];
  slug?: string[];
}

export interface RwaDataSource {
  readonly mode: "live" | "fixture";
  capabilities(): { marketPairs: Capability };
  listRwaMap(opts?: {
    assetType?: string;
    symbol?: string[];
    limit?: number;
    maxPages?: number;
  }): Promise<CmcResult<RwaMapEntry[]>>;
  getRwaInfo(id: RwaIdentifier): Promise<CmcResult<RwaInfoEntry[]>>;
  listRwaAssets(opts?: {
    assetType?: string;
    sort?: string;
    limit?: number;
    maxPages?: number;
  }): Promise<CmcResult<RwaListEntry[]>>;
  getRwaQuotes(id: RwaIdentifier, convert?: string): Promise<CmcResult<RwaQuotesEntry[]>>;
  listIssuers(opts?: { limit?: number; maxPages?: number }): Promise<CmcResult<RwaIssuerListEntry[]>>;
  getIssuer(issuerId: string): Promise<CmcResult<RwaIssuerResponse["data"]>>;
  getMarketPairs(
    id: RwaIdentifier,
    convert?: string,
  ): Promise<CmcResult<{ available: boolean; pairs: RwaMarketPair[] }>>;
  getKeyInfo(): Promise<CmcResult<KeyInfoResponse["data"]>>;
}

interface AdapterDeps {
  client: CmcClient;
  diagnostics?: DiagnosticsSink | undefined;
  dataMode: "live" | "fixture";
  /** Max pages auto-followed for paginated endpoints. */
  maxPages?: number;
}

function oneIdentifier(id: RwaIdentifier): Record<string, string> {
  const kinds = [id.rwaId, id.symbol, id.slug].filter((x) => x && x.length > 0);
  if (kinds.length !== 1) {
    throw new CmcError({
      kind: "bad_request",
      message: "Exactly one identifier type (rwaId, symbol, or slug) is required",
      endpoint: "(identifier)",
    });
  }
  if (id.rwaId) return { rwa_id: id.rwaId.join(",") };
  if (id.symbol) return { symbol: id.symbol.join(",") };
  return { rwa_slug: id.slug!.join(",") };
}

/**
 * Domain-oriented CMC adapter: validates every response with zod, attaches
 * provenance, auto-paginates, and feature-detects plan-gated endpoints.
 */
export class CmcAdapter implements RwaDataSource {
  readonly mode: "live" | "fixture";
  private readonly client: CmcClient;
  private readonly diagnostics: DiagnosticsSink | undefined;
  private readonly maxPages: number;
  private marketPairsCapability: Capability = "unknown";
  private readonly schemaNotes = new Set<string>();

  constructor(deps: AdapterDeps) {
    this.client = deps.client;
    this.diagnostics = deps.diagnostics;
    this.mode = deps.dataMode;
    this.maxPages = deps.maxPages ?? 5;
  }

  capabilities(): { marketPairs: Capability } {
    return { marketPairs: this.marketPairsCapability };
  }

  async listRwaMap(
    opts: {
      assetType?: string;
      symbol?: string[];
      limit?: number;
      maxPages?: number;
    } = {},
  ): Promise<CmcResult<RwaMapEntry[]>> {
    const params: Record<string, string | number | boolean> = { limit: opts.limit ?? 250 };
    if (opts.assetType) params["asset_type"] = opts.assetType;
    if (opts.symbol?.length) params["symbol"] = opts.symbol.join(",");
    return this.paginate(
      "/v5/real-world-assets/map",
      params,
      RwaMapResponseSchema,
      (d) => d.rwa_assets,
      CMC_TTL.map,
      opts.maxPages ?? this.maxPages,
    );
  }

  async getRwaInfo(id: RwaIdentifier): Promise<CmcResult<RwaInfoEntry[]>> {
    const params = { ...oneIdentifier(id), skip_invalid: "true" };
    const r = await this.fetch("/v5/real-world-assets/info", params, RwaInfoResponseSchema, CMC_TTL.info);
    return { ...r, data: r.data.rwa_assets };
  }

  async listRwaAssets(
    opts: {
      assetType?: string;
      sort?: string;
      limit?: number;
      maxPages?: number;
    } = {},
  ): Promise<CmcResult<RwaListEntry[]>> {
    const params: Record<string, string | number | boolean> = {
      limit: opts.limit ?? 250,
      sort: opts.sort ?? "rwa_rank",
      sort_dir: "asc",
    };
    if (opts.assetType) params["asset_type"] = opts.assetType;
    return this.paginate(
      "/v5/real-world-assets/assets/list",
      params,
      RwaListResponseSchema,
      (d) => d.rwa_assets,
      CMC_TTL.assetsList,
      opts.maxPages ?? this.maxPages,
    );
  }

  async getRwaQuotes(id: RwaIdentifier, convert = "USD"): Promise<CmcResult<RwaQuotesEntry[]>> {
    const params = { ...oneIdentifier(id), convert, skip_invalid: "true" };
    const r = await this.fetch(
      "/v5/real-world-assets/quotes/latest",
      params,
      RwaQuotesResponseSchema,
      CMC_TTL.quotes,
    );
    for (const asset of r.data.rwa_assets) {
      if (asset.tokens?.length && asset.tokens.some((t) => t.price == null)) {
        this.noteSchemaDrift("quotes/latest: some tokens have null price");
      }
      if (asset.tokens?.length && !asset.tokens.some((t) => "last_updated" in t)) {
        this.noteSchemaDrift(
          "quotes/latest: tokens[] carry no per-token timestamp (observedAt falls back to retrieval time)",
        );
      }
    }
    return { ...r, data: r.data.rwa_assets };
  }

  async listIssuers(
    opts: { limit?: number; maxPages?: number } = {},
  ): Promise<CmcResult<RwaIssuerListEntry[]>> {
    const params: Record<string, string | number | boolean> = { limit: opts.limit ?? 250 };
    return this.paginate(
      "/v5/real-world-assets/issuers/list",
      params,
      RwaIssuersListResponseSchema,
      (d) => d.issuers,
      CMC_TTL.issuers,
      opts.maxPages ?? this.maxPages,
    );
  }

  async getIssuer(issuerId: string): Promise<CmcResult<RwaIssuerResponse["data"]>> {
    const r = await this.fetch(
      "/v5/real-world-assets/issuers",
      { issuer_id: issuerId },
      RwaIssuerResponseSchema,
      CMC_TTL.issuer,
    );
    return { ...r, data: r.data };
  }

  /**
   * Market-pairs is Growth+ only. On 403/1006 the capability is recorded as
   * unavailable and the method returns `available: false` — callers must
   * surface the limitation rather than treat absence as "no markets".
   */
  async getMarketPairs(
    id: RwaIdentifier,
    convert = "USD",
  ): Promise<CmcResult<{ available: boolean; pairs: RwaMarketPair[] }>> {
    if (this.marketPairsCapability === "no") {
      return this.syntheticUnavailable("/v5/real-world-assets/market-pairs/list", oneIdentifier(id));
    }
    const params = { ...oneIdentifier(id), convert, limit: 250 };
    try {
      const r = await this.fetch(
        "/v5/real-world-assets/market-pairs/list",
        params,
        RwaMarketPairsResponseSchema,
        CMC_TTL.marketPairs,
      );
      this.marketPairsCapability = "yes";
      return { ...r, data: { available: true, pairs: r.data.market_pairs ?? [] } };
    } catch (e) {
      if (e instanceof CmcError && e.kind === "plan_gated") {
        this.marketPairsCapability = "no";
        this.diagnostics?.record({
          at: new Date().toISOString(),
          endpoint: "/v5/real-world-assets/market-pairs/list",
          params,
          latencyMs: 0,
          httpStatus: e.httpStatus,
          cmcErrorCode: e.cmcErrorCode,
          creditCount: 0,
          outcome: "plan_gated",
          note: "market-pairs requires Growth+ plan; capability disabled for session",
        });
        return this.syntheticUnavailable("/v5/real-world-assets/market-pairs/list", params);
      }
      throw e;
    }
  }

  async getKeyInfo(): Promise<CmcResult<KeyInfoResponse["data"]>> {
    const r = await this.fetch("/v1/key/info", {}, KeyInfoResponseSchema, CMC_TTL.keyInfo);
    return { ...r, data: r.data };
  }

  // ---- internals -------------------------------------------------------------

  private syntheticUnavailable(
    endpoint: string,
    params: Record<string, string | number | boolean>,
  ): CmcResult<{ available: boolean; pairs: RwaMarketPair[] }> {
    return {
      data: { available: false, pairs: [] },
      provenance: {
        endpoint,
        params,
        retrievedAt: new Date().toISOString(),
        requestId: "plan-gated",
        dataMode: this.mode,
        creditCount: 0,
      },
      cacheHit: false,
      creditCount: 0,
    };
  }

  private noteSchemaDrift(note: string): void {
    if (this.schemaNotes.has(note)) return;
    this.schemaNotes.add(note);
    this.diagnostics?.record({
      at: new Date().toISOString(),
      endpoint: "(schema)",
      params: {},
      latencyMs: 0,
      httpStatus: null,
      cmcErrorCode: null,
      creditCount: null,
      outcome: "ok",
      note,
    });
  }

  private async fetch<S extends z.ZodTypeAny>(
    path: string,
    params: Record<string, string | number | boolean>,
    schema: S,
    ttlMs: number,
  ): Promise<CmcResult<NonNullable<z.infer<S>["data"]>> & { raw: z.infer<S> }> {
    const res = await this.client.request<unknown>(path, params, { ttlMs });
    const parsed = schema.safeParse(res.data);
    if (!parsed.success) {
      this.diagnostics?.record({
        at: new Date().toISOString(),
        endpoint: path,
        params,
        latencyMs: res.latencyMs,
        httpStatus: res.httpStatus,
        cmcErrorCode: null,
        creditCount: res.creditCount,
        outcome: "schema_error",
        note: parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      throw new CmcError({
        kind: "schema",
        message: `CMC response failed validation for ${path}: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        endpoint: path,
        httpStatus: res.httpStatus,
      });
    }
    const data = parsed.data.data;
    if (data == null) {
      throw new CmcError({
        kind: "upstream",
        message: `CMC returned empty data for ${path}`,
        endpoint: path,
      });
    }
    const provenance: Provenance = {
      endpoint: path,
      params,
      retrievedAt: new Date().toISOString(),
      requestId: res.requestId,
      dataMode: this.mode,
      creditCount: res.creditCount,
    };
    return {
      data: data as NonNullable<z.infer<S>["data"]>,
      raw: parsed.data,
      provenance,
      cacheHit: res.cacheHit,
      creditCount: res.creditCount,
    };
  }

  private async paginate<S extends z.ZodTypeAny, Item>(
    path: string,
    baseParams: Record<string, string | number | boolean>,
    schema: S,
    pick: (data: NonNullable<z.infer<S>["data"]>) => Item[],
    ttlMs: number,
    maxPages: number,
  ): Promise<CmcResult<Item[]>> {
    const items: Item[] = [];
    let start = 1;
    let pages = 0;
    let lastProv: Provenance | null = null;
    let cacheHit = true;
    let credits = 0;
    const limit = Number(baseParams["limit"] ?? 250);
    while (pages < maxPages) {
      const params = { ...baseParams, start };
      const r = await this.fetch(path, params, schema, ttlMs);
      const chunk = pick(r.data);
      items.push(...chunk);
      lastProv = r.provenance;
      cacheHit = cacheHit && r.cacheHit;
      credits += r.creditCount ?? 0;
      pages += 1;
      const hasMore = (r.data as { has_more?: boolean }).has_more === true;
      if (!hasMore || chunk.length < limit) break;
      start += chunk.length;
    }
    return {
      data: items,
      provenance: lastProv ?? {
        endpoint: path,
        params: baseParams,
        retrievedAt: new Date().toISOString(),
        requestId: "none",
        dataMode: this.mode,
      },
      cacheHit,
      creditCount: credits,
    };
  }
}
