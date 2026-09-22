/* Watchlist — persisted monitoring set with per-asset thresholds. */
import { $, $$, api, errorCard, esc } from "../util.js";

export async function mount(el, ctx) {
  const render = async () => {
    try {
      const [wl, assets] = await Promise.all([api("/api/v1/watchlist"), api("/api/v1/assets")]);
      if (wl.dataMode ?? assets.dataMode) ctx.setMode(wl.dataMode ?? assets.dataMode);
      const writable = wl.canMutate === true;
      const known = new Map((assets.assets ?? []).map((a) => [a.rwaId, a]));
      el.innerHTML = `
        <div class="card">
          <div class="card-head">
            <h2>Watchlist <span class="muted">${wl.watchlist.length}/${wl.limit}</span></h2>
            <form id="wl-add" class="wl-add">
              <label>Asset symbol<input id="wl-symbol" placeholder="NVDA, TSLA…" required ${writable ? "" : "disabled"}></label>
              ${["info", "watch", "high", "critical"].map((k) => `<label>${k} threshold (%)<input id="wl-${k}" type="number" min="0.00000001" step="any" placeholder="Default" ${writable ? "" : "disabled"}></label>`).join("")}
              <button class="btn-sm btn-accent" type="submit" ${writable ? "" : "disabled"}>Save watch</button>
            </form>
          </div>
          <p id="wl-feedback" role="status">${writable ? "Ready. Leave all thresholds blank for defaults, or enter four ascending values." : wl.canMutate === false ? "Public read-only watchlist. Changes require server-authorized administrative access; no private token is exposed here." : "Write capability unavailable. Changes are blocked until the server can establish permissions."}</p>
          <p class="muted" style="margin-bottom:10px">
            When the watchlist is empty, scans fall back to the top-ranked tokenized assets.
            Per-asset thresholds override the global info/watch/high/critical bands.
          </p>
          <div class="table-scroll"><table class="table">
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
                    <td><button class="btn-sm" data-rm="${w.rwaId}" ${writable ? "" : "disabled"} aria-label="remove ${esc(w.symbol)}">remove</button></td>
                  </tr>`;
                  })
                  .join("") ||
                `<tr><td colspan="6" class="muted">empty — using ranked fallback watchlist</td></tr>`
              }
            </tbody>
          </table></div>
        </div>`;
      $("#wl-add", el).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const symbol = $("#wl-symbol", el).value.trim().toUpperCase();
        if (!writable || !symbol) return;
        const feedback = $("#wl-feedback", el);
        const fields = ["info", "watch", "high", "critical"].map((k) => $("#wl-" + k, el));
        const raw = fields.map((f) => f.value.trim());
        const body = { symbol };
        fields.forEach((f) => f.removeAttribute("aria-invalid"));
        if (raw.some(Boolean)) {
          const parts = raw.map(Number);
          if (
            raw.some((v) => v === "") ||
            parts.some((n, i) => !Number.isFinite(n) || n <= 0 || (i > 0 && n <= parts[i - 1]))
          ) {
            feedback.textContent =
              "Enter all four positive thresholds in increasing order: info < watch < high < critical.";
            fields.forEach((f) => f.setAttribute("aria-invalid", "true"));
            return;
          }
          body.thresholds = Object.fromEntries(
            ["info", "watch", "high", "critical"].map((k, i) => [k, parts[i]]),
          );
        }
        const submit = ev.currentTarget.querySelector("[type=submit]");
        submit.disabled = true;
        feedback.textContent = "Saving watchlist…";
        try {
          await api("/api/v1/watchlist", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          await render();
          $("#wl-feedback", el).textContent = "Saved to the shared watchlist.";
        } catch (err) {
          feedback.textContent = `Save failed: ${err.message}. Your entries are preserved.`;
        } finally {
          submit.disabled = false;
        }
      });
      $$("[data-rm]", el).forEach((b) =>
        b.addEventListener("click", async () => {
          if (!writable) return;
          b.disabled = true;
          $("#wl-feedback", el).textContent = "Removing…";
          try {
            await api(`/api/v1/watchlist/${b.dataset.rm}`, { method: "DELETE" });
            render();
          } catch (err) {
            $("#wl-feedback", el).textContent = `Remove failed: ${err.message}`;
            b.disabled = false;
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
