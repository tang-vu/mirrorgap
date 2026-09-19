/* Watchlist — persisted monitoring set with per-asset thresholds. */
import { $, $$, api, errorCard, esc } from "../util.js";

export async function mount(el, ctx) {
  const render = async () => {
    try {
      const [wl, assets] = await Promise.all([api("/api/v1/watchlist"), api("/api/v1/assets")]);
      const known = new Map((assets.assets ?? []).map((a) => [a.rwaId, a]));
      el.innerHTML = `
        <div class="card">
          <div class="card-head">
            <h2>Watchlist <span class="muted">${wl.watchlist.length}/${wl.limit}</span></h2>
            <form id="wl-add" class="wl-add">
              <input id="wl-symbol" placeholder="symbol — NVDA, TSLA…" aria-label="symbol" />
              <input id="wl-thresholds" placeholder="thresholds i,w,h,c (optional)" aria-label="thresholds" />
              <button class="btn-sm btn-accent" type="submit">+ watch</button>
            </form>
          </div>
          <p class="muted" style="margin-bottom:10px">
            When the watchlist is empty, scans fall back to the top-ranked tokenized assets.
            Per-asset thresholds override the global info/watch/high/critical bands.
          </p>
          <table class="table">
            <thead><tr><th>Symbol</th><th>Name</th><th>RWA ID</th><th>Thresholds</th><th>Added</th><th></th></tr></thead>
            <tbody>
              ${
                wl.watchlist
                  .map((w) => {
                    const a = known.get(w.rwaId);
                    return `<tr>
                    <td><strong>${esc(w.symbol)}</strong></td>
                    <td class="muted">${esc(a?.name ?? "—")}</td>
                    <td class="num">${w.rwaId}</td>
                    <td class="mono">${w.thresholds ? `≥${w.thresholds.info} ≥${w.thresholds.watch} ≥${w.thresholds.high} ≥${w.thresholds.critical}` : '<span class="muted">defaults</span>'}</td>
                    <td class="muted">${esc(w.addedAt.slice(0, 10))}</td>
                    <td><button class="btn-sm" data-rm="${w.rwaId}" aria-label="remove ${esc(w.symbol)}">remove</button></td>
                  </tr>`;
                  })
                  .join("") ||
                `<tr><td colspan="6" class="muted">empty — using ranked fallback watchlist</td></tr>`
              }
            </tbody>
          </table>
        </div>`;
      $("#wl-add", el).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const symbol = $("#wl-symbol", el).value.trim().toUpperCase();
        const thrRaw = $("#wl-thresholds", el).value.trim();
        if (!symbol) return;
        const body = { symbol };
        if (thrRaw) {
          const parts = thrRaw.split(",").map((s) => Number(s.trim()));
          if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
            alert("thresholds must be 4 numbers: info,watch,high,critical");
            return;
          }
          body.thresholds = { info: parts[0], watch: parts[1], high: parts[2], critical: parts[3] };
        }
        try {
          await api("/api/v1/watchlist", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          render();
        } catch (err) {
          alert(`watchlist: ${err.message}`);
        }
      });
      $$("[data-rm]", el).forEach((b) =>
        b.addEventListener("click", async () => {
          try {
            await api(`/api/v1/watchlist/${b.dataset.rm}`, { method: "DELETE" });
            render();
          } catch (err) {
            alert(`watchlist: ${err.message}`);
          }
        }),
      );
    } catch (e) {
      el.innerHTML = errorCard(e, true);
      $("[data-retry]", el)?.addEventListener("click", render);
    }
  };
  await render();
}
