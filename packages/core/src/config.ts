import { z } from "zod";

/** Severity thresholds in percent, ascending: info < watch < high < critical. */
export const ThresholdsSchema = z
  .object({
    info: z.number().positive(),
    watch: z.number().positive(),
    high: z.number().positive(),
    critical: z.number().positive(),
  })
  .refine((t) => t.info < t.watch && t.watch < t.high && t.high < t.critical, {
    message: "thresholds must be strictly ascending",
  });
export type Thresholds = z.infer<typeof ThresholdsSchema>;

export const MirrorGapConfigSchema = z.object({
  dataMode: z.enum(["live", "fixture"]),
  dbPath: z.string().min(1),
  thresholds: ThresholdsSchema,
  confirmScans: z.number().int().min(1),
  scanIntervalSeconds: z.number().int().min(15),
  watchLimit: z.number().int().min(1).max(250),
  freshSeconds: z.number().positive(),
  agingSeconds: z.number().positive(),
  scanToken: z.string().nullable(),
  llm: z.object({
    apiKey: z.string().nullable(),
    baseUrl: z.string(),
    model: z.string().nullable(),
  }),
});
export type MirrorGapConfig = z.infer<typeof MirrorGapConfigSchema>;

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric env value: "${v}"`);
  }
  return n;
};

/**
 * Resolve runtime configuration from environment variables with safe,
 * documented defaults. `dataMode` is decided by the caller (auto-detection
 * of CMC_API_KEY happens in the runtime factory, not here).
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  opts: { dataMode?: "live" | "fixture" } = {},
): MirrorGapConfig {
  const requestedMode = (env.MIRRORGAP_DATA_MODE ?? "auto").toLowerCase();
  const hasKey = Boolean(env.CMC_API_KEY?.trim());
  const dataMode: "live" | "fixture" =
    opts.dataMode ??
    (requestedMode === "fixture"
      ? "fixture"
      : requestedMode === "live"
        ? "live"
        : hasKey
          ? "live"
          : "fixture");

  if (requestedMode === "live" && !hasKey) {
    throw new Error(
      "MIRRORGAP_DATA_MODE=live but CMC_API_KEY is not set. " +
        "Provide a key or use MIRRORGAP_DATA_MODE=auto|fixture.",
    );
  }

  return MirrorGapConfigSchema.parse({
    dataMode,
    dbPath: env.MIRRORGAP_DB_PATH?.trim() || "./data/mirrorgap.db",
    thresholds: {
      info: num(env.MIRRORGAP_THRESHOLD_INFO, 0.25),
      watch: num(env.MIRRORGAP_THRESHOLD_WATCH, 0.5),
      high: num(env.MIRRORGAP_THRESHOLD_HIGH, 1.0),
      critical: num(env.MIRRORGAP_THRESHOLD_CRITICAL, 2.0),
    },
    confirmScans: num(env.MIRRORGAP_CONFIRM_SCANS, 2),
    scanIntervalSeconds: Math.max(15, num(env.MIRRORGAP_SCAN_INTERVAL, 60)),
    watchLimit: num(env.MIRRORGAP_WATCH_LIMIT, 40),
    freshSeconds: num(env.MIRRORGAP_FRESH_SECONDS, 120),
    agingSeconds: num(env.MIRRORGAP_AGING_SECONDS, 600),
    scanToken: env.MIRRORGAP_SCAN_TOKEN?.trim() || null,
    llm: {
      apiKey: env.LLM_API_KEY?.trim() || null,
      baseUrl: env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1",
      model: env.LLM_MODEL?.trim() || null,
    },
  });
}
