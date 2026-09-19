/* Shared helpers — no deps, no build step. */

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const fmt = (n, d = 4) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d });
export const fmtPct = (n) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${fmt(n, 2)}%`);
export const fmtPctAbs = (n) => (n === null || n === undefined ? "—" : `${fmt(n, 2)}%`);
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export const sevClass = (s) => `sev sev-${s ?? "none"}`;
export const stateClass = (s) => `state ${s ?? ""}`;

export const ago = (iso) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h ago`;
  return `${(s / 86400).toFixed(1)}d ago`;
};

export const clock = (iso) => (iso ? iso.slice(11, 19) : "—");
export const dateTime = (iso) => (iso ? iso.slice(0, 19).replace("T", " ") + "Z" : "—");

export async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const body = await r.json();
      msg = body?.error?.message ?? body?.error ?? msg;
    } catch {
      /* keep status */
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.json();
}

export const SEV_ORDER = { critical: 4, high: 3, watch: 2, info: 1, none: 0 };
export const SEV_COLOR = {
  none: "#3ddc97",
  info: "#5b9dff",
  watch: "#f5c453",
  high: "#f5853f",
  critical: "#f5564e",
};

export function errorCard(err, retry) {
  return `<div class="card empty">
    <p class="verify-bad">Failed to load: ${esc(err.message ?? err)}</p>
    ${retry ? '<button class="back" data-retry>retry</button>' : ""}
  </div>`;
}

export const empty = (msg) => `<div class="card empty"><p class="muted">${esc(msg)}</p></div>`;
