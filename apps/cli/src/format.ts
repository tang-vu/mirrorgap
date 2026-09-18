/* Tiny terminal formatting helpers — no deps. */

const enabled = process.stdout.isTTY && !process.env.NO_COLOR;
export const c = {
  dim: (s: string) => (enabled ? `[2m${s}[0m` : s),
  bold: (s: string) => (enabled ? `[1m${s}[0m` : s),
  green: (s: string) => (enabled ? `[32m${s}[0m` : s),
  yellow: (s: string) => (enabled ? `[33m${s}[0m` : s),
  red: (s: string) => (enabled ? `[31m${s}[0m` : s),
  cyan: (s: string) => (enabled ? `[36m${s}[0m` : s),
  blue: (s: string) => (enabled ? `[34m${s}[0m` : s),
};

export function sevColor(sev: string): string {
  switch (sev) {
    case "critical":
      return c.red(sev.toUpperCase());
    case "high":
      return c.yellow(sev.toUpperCase());
    case "watch":
      return c.yellow(sev);
    case "info":
      return c.blue(sev);
    default:
      return c.green(sev);
  }
}

export function table(rows: string[][], headers: string[]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => strip(r[i] ?? "").length)));
  const line = (r: string[]) => "  " + r.map((cell, i) => pad(strip(cell), widths[i]!, cell)).join("  ");
  return [c.bold(line(headers)), ...rows.map(line)].join("\n");
}
function strip(s: string): string {
  return s.replace(/\[\d+m/g, "");
}
function pad(plain: string, w: number, raw: string): string {
  return raw + " ".repeat(Math.max(0, w - plain.length));
}
export const fmtPct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
export const fmtN = (n: number | null | undefined, d = 4) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d });
