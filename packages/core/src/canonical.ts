/**
 * Deterministic canonical JSON serialization (JCS-inspired, RFC 8785 style).
 *
 * Rules:
 *  - Object keys sorted by UTF-16 code unit order, no whitespace.
 *  - Numbers: integers emit without decimal point; non-integers use the
 *    shortest round-trip form via JSON number grammar. NaN/Infinity rejected.
 *  - Strings via JSON.stringify escaping; arrays preserve order.
 *  - `undefined` object properties are dropped (same as JSON.stringify).
 *
 * All receipt hashing flows through this single function.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalJson: non-finite number");
    }
    return serializeNumber(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => serialize(v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + serialize(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`canonicalJson: unsupported type ${typeof value}`);
}

function serializeNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) {
    return n.toString();
  }
  // Shortest round-trip decimal representation, matching JSON.stringify.
  return JSON.stringify(n);
}

/** Round a number to a fixed number of decimals for stable hashing. */
export function roundForHash(value: number, decimals = 6): number {
  const f = 10 ** decimals;
  // +0 guard avoids emitting -0
  return Math.round(value * f) / f + 0;
}
