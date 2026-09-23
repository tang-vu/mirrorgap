import { CmcError, classifyCmcError, isRetryable } from "./errors.js";
import type { DiagnosticsSink } from "./diagnostics.js";
import { TtlCache, cacheKey } from "./cache.js";

export interface CmcClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Max requests per rolling minute (Startup plan ~30). Conservative default. */
  maxRequestsPerMinute?: number;
  maxRetries?: number;
  cache?: TtlCache;
  diagnostics?: DiagnosticsSink | undefined;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  requestIdFactory?: () => string;
}

export interface CmcResponse<T> {
  data: T;
  httpStatus: number;
  creditCount: number | null;
  requestId: string;
  cacheHit: boolean;
  latencyMs: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let reqSeq = 0;

/**
 * Low-level CMC HTTP client. Responsibilities: auth header, timeout, bounded
 * exponential-backoff retry, per-minute rate limiting, TTL caching,
 * normalized errors, credit + diagnostics recording. The API key is held in a
 * private field and never appears in params, logs, or errors.
 */
export class CmcClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly cache: TtlCache;
  private readonly diagnostics: DiagnosticsSink | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly requestIdFactory: () => string;
  private requestTimestamps: number[] = [];
  private readonly maxPerMinute: number;

  constructor(opts: CmcClientOptions) {
    if (!opts.apiKey?.trim())
      throw new CmcError({ kind: "auth", message: "CMC_API_KEY is empty", endpoint: "(init)" });
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://pro-api.coinmarketcap.com").replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.cache = opts.cache ?? new TtlCache();
    this.diagnostics = opts.diagnostics;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.requestIdFactory = opts.requestIdFactory ?? (() => `req_${Date.now()}_${++reqSeq}`);
    this.maxPerMinute = opts.maxRequestsPerMinute ?? 25;
  }

  /** Request path, e.g. "/v5/real-world-assets/quotes/latest". */
  async request<T = unknown>(
    path: string,
    params: Record<string, string | number | boolean> = {},
    opts: { ttlMs?: number; skipCache?: boolean } = {},
  ): Promise<CmcResponse<T>> {
    const key = cacheKey(path, params);
    if (!opts.skipCache && opts.ttlMs && opts.ttlMs > 0) {
      const hit = this.cache.get<T>(key);
      if (hit) {
        this.diagnostics?.record({
          at: new Date().toISOString(),
          endpoint: path,
          params,
          latencyMs: 0,
          httpStatus: 200,
          cmcErrorCode: 0,
          creditCount: 0,
          outcome: "cache_hit",
        });
        return {
          data: hit.value,
          httpStatus: 200,
          creditCount: 0,
          requestId: "cache",
          cacheHit: true,
          latencyMs: 0,
        };
      }
    }

    await this.throttle();
    const requestId = this.requestIdFactory();
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    let attempt = 0;
    let lastErr: CmcError | null = null;
    while (attempt <= this.maxRetries) {
      const started = Date.now();
      try {
        const res = await this.fetchWithTimeout(url);
        const latency = Date.now() - started;
        const body = (await res.json().catch(() => null)) as {
          status?: {
            error_code?: number | string | null;
            error_message?: string | null;
            credit_count?: number | null;
          };
          data?: unknown;
        } | null;

        if (!res.ok) {
          const rawCode = body?.status?.error_code;
          const code =
            typeof rawCode === "number"
              ? rawCode
              : typeof rawCode === "string" && /^\d+$/.test(rawCode)
                ? Number(rawCode)
                : null;
          const kind = classifyCmcError(res.status, code);
          const err = new CmcError({
            kind,
            message: body?.status?.error_message || `CMC HTTP ${res.status}`,
            endpoint: path,
            httpStatus: res.status,
            cmcErrorCode: code,
            retryAfterSeconds: res.headers.get("retry-after") ? Number(res.headers.get("retry-after")) : null,
          });
          this.recordDiag(
            path,
            params,
            latency,
            res.status,
            code,
            null,
            kind === "plan_gated" || kind === "rate_limited" ? kind : "error",
            err.message,
          );
          if (isRetryable(err) && attempt < this.maxRetries) {
            lastErr = err;
            await this.sleep(this.backoff(attempt, err.retryAfterSeconds));
            attempt += 1;
            continue;
          }
          throw err;
        }

        const creditCount = body?.status?.credit_count ?? null;
        const rawCode = body?.status?.error_code;
        const code =
          typeof rawCode === "number"
            ? rawCode
            : typeof rawCode === "string" && /^\d+$/.test(rawCode)
              ? Number(rawCode)
              : 0;
        this.recordDiag(path, params, latency, res.status, code, creditCount, "ok");
        const data = body as T;
        if (opts.ttlMs && opts.ttlMs > 0) this.cache.set(key, data, opts.ttlMs);
        return { data, httpStatus: res.status, creditCount, requestId, cacheHit: false, latencyMs: latency };
      } catch (e) {
        if (e instanceof CmcError) throw e;
        const latency = Date.now() - started;
        const isTimeout = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
        const err = new CmcError({
          kind: isTimeout ? "timeout" : "network",
          message: isTimeout
            ? `CMC request timed out after ${this.timeoutMs}ms`
            : `Network error: ${(e as Error).message}`,
          endpoint: path,
        });
        this.recordDiag(path, params, latency, null, null, null, "error", err.message);
        if (attempt < this.maxRetries) {
          lastErr = err;
          await this.sleep(this.backoff(attempt, null));
          attempt += 1;
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new CmcError({ kind: "upstream", message: "request failed", endpoint: path });
  }

  private async fetchWithTimeout(url: URL): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url.toString(), {
        headers: {
          "X-CMC_PRO_API_KEY": this.apiKey,
          Accept: "application/json",
        },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }

  private backoff(attempt: number, retryAfterSeconds: number | null): number {
    if (retryAfterSeconds) return Math.min(retryAfterSeconds * 1000, 30_000);
    const base = Math.min(500 * 2 ** attempt, 8_000);
    return base + Math.random() * 200;
  }

  /** Simple rolling-window client-side rate limiter. */
  private async throttle(): Promise<void> {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60_000);
    if (this.requestTimestamps.length >= this.maxPerMinute) {
      const wait = 60_000 - (now - this.requestTimestamps[0]!) + 25;
      await this.sleep(wait);
      this.requestTimestamps = this.requestTimestamps.filter((t) => Date.now() - t < 60_000);
    }
    this.requestTimestamps.push(Date.now());
  }

  private recordDiag(
    endpoint: string,
    params: Record<string, string | number | boolean>,
    latencyMs: number,
    httpStatus: number | null,
    cmcErrorCode: number | null,
    creditCount: number | null,
    outcome: "ok" | "error" | "plan_gated" | "rate_limited",
    note?: string,
  ): void {
    this.diagnostics?.record({
      at: new Date().toISOString(),
      endpoint,
      params,
      latencyMs,
      httpStatus,
      cmcErrorCode,
      creditCount,
      outcome,
      ...(note ? { note } : {}),
    });
  }
}
