import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal .env loader — no dependency. Only fills vars that are not already
 * set (real env wins). Supports KEY=value, # comments, optional quotes.
 * Never throws; a missing .env is fine (fixture mode has no secrets).
 */
export function loadDotEnv(dir = process.cwd()): Record<string, string> {
  const file = join(dir, ".env");
  const loaded: Record<string, string> = {};
  if (!existsSync(file)) return loaded;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    loaded[key] = val;
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return loaded;
}
