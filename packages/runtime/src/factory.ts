import { loadConfig, type MirrorGapConfig } from "@mirrorgap/core";
import { createDataSource, InMemoryDiagnostics, TtlCache } from "@mirrorgap/cmc";
import { SqliteStore } from "@mirrorgap/storage";
import { MirrorGapRuntime, type RuntimeDeps } from "./runtime.js";
import { loadDotEnv } from "./dotenv.js";
import { RuntimeBus } from "./events.js";

export interface RuntimeInstance {
  runtime: MirrorGapRuntime;
  config: MirrorGapConfig;
  bus: RuntimeBus;
  diagnostics: InMemoryDiagnostics;
  close(): void;
}

/**
 * One-call wiring used by the HTTP server, CLI, and MCP server: config →
 * data source (live or fixture) → sqlite store → runtime.
 */
export function createRuntime(
  opts: {
    env?: NodeJS.ProcessEnv;
    dataMode?: "live" | "fixture";
    dbPath?: string;
    apiKey?: string;
    signingKey?: string;
  } = {},
): RuntimeInstance {
  if (!opts.env) loadDotEnv();
  const config = loadConfig(opts.env ?? process.env, {
    ...(opts.dataMode ? { dataMode: opts.dataMode } : {}),
  });
  const diagnostics = new InMemoryDiagnostics();
  const { source } = createDataSource({
    mode: opts.dataMode ?? config.dataMode,
    apiKey: opts.apiKey ?? opts.env?.CMC_API_KEY ?? process.env.CMC_API_KEY ?? null,
    diagnostics,
    cache: new TtlCache(),
  });
  const store = new SqliteStore(opts.dbPath ?? config.dbPath);
  const bus = new RuntimeBus();
  const deps: RuntimeDeps = {
    config,
    source,
    store,
    bus,
    signingKey:
      opts.signingKey ?? opts.env?.MIRRORGAP_SIGNING_KEY ?? process.env.MIRRORGAP_SIGNING_KEY ?? undefined,
  };
  return {
    runtime: new MirrorGapRuntime(deps),
    config,
    bus,
    diagnostics,
    close: () => store.close(),
  };
}
