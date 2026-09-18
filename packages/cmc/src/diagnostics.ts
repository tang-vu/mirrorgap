/**
 * Non-sensitive integration diagnostics — powers docs/cmc-api-feedback.md.
 * Records endpoint, latency, status, credits, plan-gating, schema drift.
 * NEVER records the API key or full request headers.
 */

export interface CmcDiagnostic {
  at: string;
  endpoint: string;
  params: Record<string, string | number | boolean>;
  latencyMs: number;
  httpStatus: number | null;
  cmcErrorCode: number | null;
  creditCount: number | null;
  outcome: "ok" | "error" | "schema_error" | "plan_gated" | "rate_limited" | "cache_hit";
  note?: string;
}

export interface DiagnosticsSink {
  record(d: CmcDiagnostic): void;
}

export class InMemoryDiagnostics implements DiagnosticsSink {
  readonly entries: CmcDiagnostic[] = [];
  private readonly max: number;

  constructor(max = 500) {
    this.max = max;
  }

  record(d: CmcDiagnostic): void {
    this.entries.push(d);
    if (this.entries.length > this.max) this.entries.shift();
  }

  summary(): {
    calls: number;
    errors: number;
    planGated: number;
    rateLimited: number;
    credits: number;
    byEndpoint: Record<string, number>;
  } {
    const byEndpoint: Record<string, number> = {};
    let errors = 0;
    let planGated = 0;
    let rateLimited = 0;
    let credits = 0;
    for (const e of this.entries) {
      byEndpoint[e.endpoint] = (byEndpoint[e.endpoint] ?? 0) + 1;
      if (e.outcome !== "ok" && e.outcome !== "cache_hit") errors += 1;
      if (e.outcome === "plan_gated") planGated += 1;
      if (e.outcome === "rate_limited") rateLimited += 1;
      credits += e.creditCount ?? 0;
    }
    return {
      calls: this.entries.length,
      errors,
      planGated,
      rateLimited,
      credits,
      byEndpoint,
    };
  }
}
