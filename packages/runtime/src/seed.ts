import type { MirrorGapRuntime } from "./runtime.js";
import type { ScanOutcome } from "./runtime.js";

export interface SeedHistoryOptions {
  /** Number of scan ticks to run (one tick = one scan, 1 minute apart). */
  ticks: number;
  /** Anchor time — seeding runs BACKWARDS from here so "now" is the tip. */
  now?: Date;
  /** Milliseconds between ticks. Default 60_000 (matches fixture arc). */
  intervalMs?: number;
}

/**
 * Seed deterministic fixture history by replaying real scans at pinned
 * timestamps. Every observation, transition, investigation, receipt and
 * alert goes through the identical production code path — only the clock
 * and (fixture) prices are scripted.
 */
export async function seedHistory(
  runtime: MirrorGapRuntime,
  opts: SeedHistoryOptions,
): Promise<{ scans: ScanOutcome[] }> {
  const interval = opts.intervalMs ?? 60_000;
  const tip = (opts.now ?? new Date()).getTime();
  const start = tip - (opts.ticks - 1) * interval;
  const scans: ScanOutcome[] = [];
  for (let i = 0; i < opts.ticks; i++) {
    scans.push(await runtime.scan({ now: new Date(start + i * interval), label: "seed" }));
  }
  return { scans };
}
