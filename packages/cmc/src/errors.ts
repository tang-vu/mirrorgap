/** Normalized CMC error taxonomy — raw HTTP never leaks upstream. */

export type CmcErrorKind =
  "auth" | "plan_gated" | "rate_limited" | "bad_request" | "upstream" | "timeout" | "schema" | "network";

export class CmcError extends Error {
  readonly kind: CmcErrorKind;
  readonly httpStatus: number | null;
  readonly cmcErrorCode: number | null;
  readonly endpoint: string;
  /** Retry-After hint in seconds when CMC supplies one (429s). */
  readonly retryAfterSeconds: number | null;

  constructor(input: {
    kind: CmcErrorKind;
    message: string;
    endpoint: string;
    httpStatus?: number | null;
    cmcErrorCode?: number | null;
    retryAfterSeconds?: number | null;
  }) {
    super(input.message);
    this.name = "CmcError";
    this.kind = input.kind;
    this.endpoint = input.endpoint;
    this.httpStatus = input.httpStatus ?? null;
    this.cmcErrorCode = input.cmcErrorCode ?? null;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

/** Map HTTP status + CMC error_code to a normalized kind. */
export function classifyCmcError(httpStatus: number, cmcErrorCode: number | null): CmcErrorKind {
  if (httpStatus === 401 || cmcErrorCode === 1001 || cmcErrorCode === 1002) return "auth";
  if (httpStatus === 403 || cmcErrorCode === 1006 || cmcErrorCode === 1005 || cmcErrorCode === 1007) {
    // 1006 = plan doesn't support this endpoint — the feature-detection signal
    return "plan_gated";
  }
  if (httpStatus === 402 || cmcErrorCode === 1003 || cmcErrorCode === 1004) return "plan_gated";
  if (httpStatus === 429 || (cmcErrorCode !== null && cmcErrorCode >= 1008 && cmcErrorCode <= 1011)) {
    return "rate_limited";
  }
  if (httpStatus === 400) return "bad_request";
  if (httpStatus >= 500) return "upstream";
  return "network";
}

export function isRetryable(err: CmcError): boolean {
  return (
    err.kind === "rate_limited" || err.kind === "upstream" || err.kind === "network" || err.kind === "timeout"
  );
}

/** Ensure a value is safe to log — strips anything that looks like an API key. */
export function redactSecrets<T>(value: T): T {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") {
      if (typeof v === "string" && v.length >= 24 && /^[0-9a-f-]{24,}$/i.test(v)) {
        return "***redacted***";
      }
      return v;
    }
    if (seen.has(v)) return v;
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/api[-_]?key|x-cmc_pro_api_key|authorization|token|secret/i.test(k)) {
        out[k] = "***redacted***";
      } else {
        out[k] = walk(val);
      }
    }
    return out;
  };
  return walk(value) as T;
}
