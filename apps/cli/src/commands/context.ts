import { createRuntime, type RuntimeInstance } from "@mirrorgap/runtime";

export function argFlag(args: string[], name: string): string | null {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : null;
}
export const has = (args: string[], name: string) => args.includes(`--${name}`);

export function makeRuntime(args: string[]): RuntimeInstance {
  const dataMode = has(args, "fixture") ? "fixture" : has(args, "live") ? "live" : undefined;
  const dbPath = argFlag(args, "db") ?? undefined;
  return createRuntime({
    ...(dataMode ? { dataMode } : {}),
    ...(dbPath ? { dbPath } : {}),
  });
}

/** Resolve a symbol-or-id argument to an rwaId using stored assets + map. */
export async function resolveRwaId(inst: RuntimeInstance, target: string): Promise<number | null> {
  if (/^\d+$/.test(target)) return Number(target);
  const sym = target.toUpperCase();
  const stored = inst.runtime.store.findAssetBySymbol(sym);
  if (stored) return stored.rwaId;
  const found = await inst.runtime.source.listRwaMap({ symbol: [sym] });
  return found.data?.[0]?.rwa_id ?? null;
}
