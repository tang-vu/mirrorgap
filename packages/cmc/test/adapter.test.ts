import { describe, expect, it, vi } from "vitest";
import { CmcClient } from "../src/client.js";
import { CmcAdapter } from "../src/adapter.js";
import { CmcError } from "../src/errors.js";
import { InMemoryDiagnostics } from "../src/diagnostics.js";
import { FixtureDataSource } from "../src/fixtures/index.js";
import { malformedQuotesPayload } from "../src/fixtures/data.js";

const API_KEY = "test-key-1234567890abcdef1234";

function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const okBody = (data: unknown) => ({
  data,
  status: { timestamp: "2026-09-18T15:00:00.000Z", error_code: 0, error_message: null, credit_count: 1 },
});

const errBody = (code: number, msg: string) => ({
  status: { timestamp: "2026-09-18T15:00:00.000Z", error_code: code, error_message: msg, credit_count: 0 },
});

const sleep = () => Promise.resolve();

function clientWith(fetchFn: typeof fetch) {
  const diagnostics = new InMemoryDiagnostics();
  const client = new CmcClient({
    apiKey: API_KEY,
    fetchFn,
    sleep,
    diagnostics,
    maxRequestsPerMinute: 1000,
  });
  return { client, diagnostics };
}

describe("CmcClient", () => {
  it("sends the API key header and parses success", async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe("/v5/real-world-assets/map");
      return mockResponse(200, okBody({ rwa_assets: [], has_more: false }));
    }) as unknown as typeof fetch;
    const { client } = clientWith(fetchFn);
    const res = await client.request("/v5/real-world-assets/map");
    expect(res.httpStatus).toBe(200);
    expect(res.creditCount).toBe(1);
  });

  it("classifies 401 as auth error without retrying", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse(401, errBody(1001, "This API Key is invalid.")),
    ) as unknown as typeof fetch;
    const { client } = clientWith(fetchFn);
    await expect(client.request("/v1/key/info")).rejects.toMatchObject({ kind: "auth", cmcErrorCode: 1001 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("classifies 403/1006 as plan_gated without retrying", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse(403, errBody(1006, "Your API Key subscription plan doesn't support this endpoint.")),
    ) as unknown as typeof fetch;
    const { client } = clientWith(fetchFn);
    await expect(client.request("/v5/real-world-assets/market-pairs/list")).rejects.toMatchObject({
      kind: "plan_gated",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("classifies a numeric-string CMC error code", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse(403, {
        status: {
          timestamp: "2026-09-18T15:00:00.000Z",
          error_code: "1006",
          error_message: "plan gated",
          credit_count: 0,
        },
      }),
    ) as unknown as typeof fetch;
    const { client } = clientWith(fetchFn);
    await expect(client.request("/v5/real-world-assets/market-pairs/list")).rejects.toMatchObject({
      kind: "plan_gated",
      cmcErrorCode: 1006,
    });
  });

  it("retries on 429 with bounded backoff", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) return mockResponse(429, errBody(1008, "rate limit"), { "retry-after": "1" });
      return mockResponse(200, okBody({ rwa_assets: [] }));
    }) as unknown as typeof fetch;
    const { client } = clientWith(fetchFn);
    const res = await client.request("/v5/real-world-assets/map");
    expect(res.httpStatus).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("retries on 500 then gives up", async () => {
    const fetchFn = vi.fn(async () => mockResponse(500, errBody(0, "oops"))) as unknown as typeof fetch;
    const { client } = clientWith(fetchFn);
    await expect(client.request("/v5/real-world-assets/map")).rejects.toMatchObject({ kind: "upstream" });
    expect(fetchFn).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });

  it("produces timeout errors on abort", async () => {
    const fetchFn = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
      })) as unknown as typeof fetch;
    const diagnostics = new InMemoryDiagnostics();
    const client = new CmcClient({ apiKey: API_KEY, fetchFn, sleep, timeoutMs: 5, diagnostics });
    await expect(client.request("/v5/real-world-assets/map")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("serves repeat calls from cache within TTL", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse(
        200,
        okBody({
          rwa_assets: [{ rwa_id: 1, name: "Gold", symbol: "GOLD", slug: "gold", asset_type: "commodity" }],
        }),
      ),
    ) as unknown as typeof fetch;
    const { client, diagnostics } = clientWith(fetchFn);
    await client.request("/v5/real-world-assets/map", {}, { ttlMs: 30_000 });
    const res2 = await client.request("/v5/real-world-assets/map", {}, { ttlMs: 30_000 });
    expect(res2.cacheHit).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(diagnostics.entries.some((d) => d.outcome === "cache_hit")).toBe(true);
  });
});

describe("CmcAdapter", () => {
  const quotesBody = {
    rwa_assets: [
      {
        name: "Nvidia Corp",
        symbol: "NVDA",
        slug: "nvidia",
        rwa_id: 2,
        asset_type: "stock",
        rwa_rank: 2,
        has_tokens: true,
        quotes: [
          {
            symbol: "USD",
            crypto_id: 2781,
            average_tokenized_price: 226.46,
            tokenized_market_cap: 117e6,
            tokenized_volume_24h: 79e6,
            last_updated: "2026-09-18T14:59:30.000Z",
          },
        ],
        tokens: [
          {
            symbol: "NVDAX",
            name: "NVIDIA xStock",
            crypto_id: 36992,
            issuer_id: "6878977dcbbf471de3366e85",
            issuer_name: "Backed Assets",
            price: 226.33,
            market_cap: 39e6,
            volume_24h: 12e6,
          },
          {
            symbol: "NVDAon",
            name: "NVIDIA Ondo",
            crypto_id: 38093,
            issuer_id: "688ca4ccabae9b5b9fb3167a",
            issuer_name: "Ondo Assets",
            price: 230.4,
            market_cap: 38e6,
            volume_24h: 2.6e6,
          },
        ],
        tradfi_markets: [
          {
            exchange: { slug: "binance", name: "Binance", exchange_id: 270 },
            ticker: "NVDA",
            market_url: "https://www.binance.com/en/stocks/EQ_NVDA",
          },
        ],
      },
    ],
  };

  it("validates and returns quotes with provenance", async () => {
    const fetchFn = vi.fn(async () => mockResponse(200, okBody(quotesBody))) as unknown as typeof fetch;
    const { client, diagnostics } = clientWith(fetchFn);
    const adapter = new CmcAdapter({ client, diagnostics, dataMode: "live" });
    const res = await adapter.getRwaQuotes({ symbol: ["NVDA"] });
    expect(res.data[0]?.rwa_id).toBe(2);
    expect(res.data[0]?.tokens).toHaveLength(2);
    expect(res.provenance.endpoint).toBe("/v5/real-world-assets/quotes/latest");
    expect(res.provenance.dataMode).toBe("live");
    // key never appears in provenance
    expect(JSON.stringify(res.provenance)).not.toContain(API_KEY);
  });

  it("accepts the numeric-string status code returned by live CMC quotes", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse(200, {
        data: quotesBody,
        status: {
          timestamp: "2026-09-18T15:00:00.000Z",
          error_code: "0",
          error_message: null,
          credit_count: 1,
        },
      }),
    ) as unknown as typeof fetch;
    const { client, diagnostics } = clientWith(fetchFn);
    const adapter = new CmcAdapter({ client, diagnostics, dataMode: "live" });
    const res = await adapter.getRwaQuotes({ symbol: ["NVDA"] });
    expect(res.data).toHaveLength(1);
    expect(diagnostics.entries.some((d) => d.outcome === "schema_error")).toBe(false);
  });

  it("throws schema errors on malformed payloads", async () => {
    const fetchFn = vi.fn(async () => mockResponse(200, malformedQuotesPayload())) as unknown as typeof fetch;
    const { client, diagnostics } = clientWith(fetchFn);
    const adapter = new CmcAdapter({ client, diagnostics, dataMode: "live" });
    await expect(adapter.getRwaQuotes({ symbol: ["BROKEN"] })).rejects.toMatchObject({ kind: "schema" });
    expect(diagnostics.entries.some((d) => d.outcome === "schema_error")).toBe(true);
  });

  it("feature-detects plan-gated market pairs and degrades", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse(403, errBody(1006, "plan doesn't support this endpoint")),
    ) as unknown as typeof fetch;
    const { client, diagnostics } = clientWith(fetchFn);
    const adapter = new CmcAdapter({ client, diagnostics, dataMode: "live" });
    const res = await adapter.getMarketPairs({ rwaId: [2] });
    expect(res.data.available).toBe(false);
    expect(adapter.capabilities().marketPairs).toBe("no");
    // second call short-circuits without a network request
    const res2 = await adapter.getMarketPairs({ rwaId: [2] });
    expect(res2.data.available).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("marks market pairs available when the endpoint works", async () => {
    const body = okBody({
      rwa_id: 2,
      market_pairs: [
        {
          exchange: { exchange_id: 270, name: "Binance", slug: "binance" },
          market_id: 99001,
          market_pair: "NVDAX/USDT",
          market_pair_base: { crypto_id: 36992, symbol: "NVDAX" },
          market_pair_quote: { crypto_id: 825, symbol: "USDT" },
          quotes: [],
        },
      ],
    });
    const fetchFn = vi.fn(async () => mockResponse(200, body)) as unknown as typeof fetch;
    const { client, diagnostics } = clientWith(fetchFn);
    const adapter = new CmcAdapter({ client, diagnostics, dataMode: "live" });
    const res = await adapter.getMarketPairs({ rwaId: [2] });
    expect(res.data.available).toBe(true);
    expect(res.data.pairs).toHaveLength(1);
    expect(adapter.capabilities().marketPairs).toBe("yes");
  });

  it("paginates until has_more is false", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async (url: string | URL) => {
      calls += 1;
      const start = Number(new URL(String(url)).searchParams.get("start") ?? "1");
      const items = Array.from({ length: start === 1 ? 250 : 10 }, (_, i) => ({
        rwa_id: start + i,
        name: `A${start + i}`,
        symbol: `A${start + i}`,
        slug: `a${start + i}`,
        asset_type: "stock",
      }));
      return mockResponse(
        200,
        okBody({ rwa_assets: items, has_more: items.length === 250, total_size: 260 }),
      );
    }) as unknown as typeof fetch;
    const { client, diagnostics } = clientWith(fetchFn);
    const adapter = new CmcAdapter({ client, diagnostics, dataMode: "live" });
    const res = await adapter.listRwaMap({ limit: 250 });
    expect(res.data).toHaveLength(260);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("rejects ambiguous identifiers", async () => {
    const { client, diagnostics } = clientWith(vi.fn() as unknown as typeof fetch);
    const adapter = new CmcAdapter({ client, diagnostics, dataMode: "live" });
    await expect(adapter.getRwaQuotes({ rwaId: [1], symbol: ["GOLD"] })).rejects.toMatchObject({
      kind: "bad_request",
    });
  });
});

describe("FixtureDataSource", () => {
  it("provides the required scenario coverage", async () => {
    const fx = new FixtureDataSource();
    expect(fx.mode).toBe("fixture");
    expect(fx.capabilities().marketPairs).toBe("no");
    const map = await fx.listRwaMap();
    const symbols = map.data.map((a) => a.symbol);
    for (const s of ["GOLD", "NVDA", "TSLA", "SPY", "HOOD", "SPCX", "AMZN"]) {
      expect(symbols).toContain(s);
    }
    const quotes = await fx.getRwaQuotes({ symbol: ["NVDA"] });
    expect(quotes.data[0]?.tokens?.length).toBe(2);
    expect(quotes.provenance.dataMode).toBe("fixture");
  });
});
