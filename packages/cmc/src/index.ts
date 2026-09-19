import { CmcClient } from "./client.js";
import { CmcAdapter, type RwaDataSource } from "./adapter.js";
import { FixtureDataSource } from "./fixtures/index.js";
import { InMemoryDiagnostics, type DiagnosticsSink } from "./diagnostics.js";
import { TtlCache } from "./cache.js";

export * from "./schemas.js";
export * from "./errors.js";
export * from "./client.js";
export * from "./adapter.js";
export * from "./cache.js";
export * from "./diagnostics.js";
export * from "./normalize.js";
export { FixtureDataSource } from "./fixtures/index.js";
export * as fixtureData from "./fixtures/data.js";

export interface CreateSourceOptions {
  mode: "live" | "fixture";
  apiKey?: string | null;
  baseUrl?: string;
  diagnostics?: DiagnosticsSink;
  cache?: TtlCache;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Fixture scenario id — "static" | "incident_cycle" (default). */
  fixtureScenario?: string;
}

/**
 * Build the data source for the chosen mode. Live mode requires an API key;
 * fixture mode never touches the network. A shared diagnostics sink is
 * created when none is provided so callers can introspect integration health.
 */
export function createDataSource(opts: CreateSourceOptions): {
  source: RwaDataSource;
  diagnostics: InMemoryDiagnostics;
} {
  const diagnostics =
    opts.diagnostics instanceof InMemoryDiagnostics ? opts.diagnostics : new InMemoryDiagnostics();
  const sink = opts.diagnostics ?? diagnostics;

  if (opts.mode === "fixture") {
    return {
      source: new FixtureDataSource(
        opts.fixtureScenario !== undefined ? { scenario: opts.fixtureScenario } : {},
      ),
      diagnostics,
    };
  }

  const key = opts.apiKey?.trim();
  if (!key) {
    throw new Error("live mode requires CMC_API_KEY");
  }
  const client = new CmcClient({
    apiKey: key,
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    ...(opts.cache ? { cache: opts.cache } : {}),
    diagnostics: sink,
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  });
  return {
    source: new CmcAdapter({ client, diagnostics: sink, dataMode: "live" }),
    diagnostics,
  };
}
