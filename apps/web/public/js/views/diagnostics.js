/* Diagnostics — CMC integration status, alert log, provenance. */
import { $, api, clock, dateTime, errorCard, esc } from "../util.js";

export async function mount(el, ctx) {
  const render = async () => {
    try {
      const [d, alerts, key, scans] = await Promise.all([
        api("/api/v1/diagnostics"),
        api("/api/v1/alerts"),
        api("/api/v1/verification-key"),
        api("/api/v1/scans"),
      ]);
      ctx.setMode(d.dataMode);
      const calls = (d.recent ?? []).slice(-25).reverse();
      const lastOk = calls.find((c2) => c2.outcome === "ok" || c2.httpStatus === 200);
      const lastErr = calls.find((c2) => c2.outcome !== "ok" && c2.httpStatus !== 200);
      ctx.setCapability(d.capabilities);
      el.innerHTML = `<header class="desk-intro"><div><p class="eyebrow">SOURCE OPERATIONS / PROVENANCE</p><h2>Know what you are observing.</h2><p class="muted">SSE is transport connectivity. Data mode, source availability and plan limits are separate capabilities.</p></div></header>
        <div class="detail-grid">
          <div class="card">
            <div class="card-head"><h2>Data source</h2><span class="badge badge-mode ${d.dataMode}">${d.dataMode}</span></div>
            <dl class="kv">
              <dt>Mode</dt><dd>${d.dataMode === "live" ? "CoinMarketCap LIVE" : "fixture (deterministic synthetic)"}</dd>
              <dt>Market-pairs API</dt><dd>${esc(d.capabilities?.marketPairs ?? "unknown")}${d.capabilities?.marketPairs === "no" ? ' <span class="muted">(Growth+ plan feature)</span>' : ""}</dd>
              <dt>Last success</dt><dd>${lastOk ? `${esc(lastOk.endpoint)} · ${esc(lastOk.at)}` : "—"}</dd>
              <dt>Last error</dt><dd>${lastErr ? `${esc(lastErr.endpoint)} · ${esc(String(lastErr.message ?? lastErr.outcome ?? ""))}` : "none"}</dd>
              <dt>Receipt signing</dt><dd>${key.signing ? `ed25519 · pubkey ${esc((key.publicKey ?? "").slice(0, 24))}…` : "unsigned (hash verification only)"}</dd>
            </dl>
          </div>
          <div class="card">
            <div class="card-head"><h2>Alerts</h2><span class="muted">min severity ${esc(alerts.minSeverity)}</span></div>
            <dl class="kv">
              <dt>Destinations</dt><dd>${(alerts.destinations ?? []).join(", ") || '<span class="muted">none configured</span>'}</dd>
              <dt>Deliveries</dt><dd>${(alerts.alerts ?? []).length} recorded</dd>
            </dl>
            ${
              (alerts.alerts ?? []).length
                ? `<table class="table" style="margin-top:8px"><tbody>
              ${alerts.alerts
                .slice(0, 8)
                .map(
                  (a) =>
                    `<tr><td class="muted">${clock(a.sentAt)}</td><td class="mono">${esc(a.eventId.slice(0, 18))}</td><td>${esc(a.transition)}</td><td>${esc(a.destination)}</td><td class="${a.status === "sent" ? "verify-ok" : "verify-bad"}">${a.status}</td></tr>`,
                )
                .join("")}
            </tbody></table>`
                : ""
            }
          </div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="card-head"><h2>Recent scans</h2></div>
          <table class="table"><thead><tr><th>Scan</th><th>Started</th><th>Mode</th><th>Assets</th><th>Anomalies</th><th>Status</th></tr></thead><tbody>
            ${
              (scans.scans ?? [])
                .slice(0, 10)
                .map(
                  (s) =>
                    `<tr><td class="mono">${esc(s.scanId.slice(0, 22))}</td><td class="muted">${dateTime(s.startedAt)}</td><td>${s.dataMode}</td><td class="num">${s.assetsScanned}</td><td class="num">${s.anomaliesFound}</td><td>${s.status}${s.error ? ` — <span class="verify-bad">${esc(s.error)}</span>` : ""}</td></tr>`,
                )
                .join("") || `<tr><td colspan="6" class="muted">no scans yet</td></tr>`
            }
          </tbody></table>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="card-head"><h2>Source call log <span class="muted">endpoint · status · latency · credits</span></h2></div>
          <table class="table"><thead><tr><th>At</th><th>Endpoint</th><th>Status</th><th>Outcome</th><th>Latency</th><th>Credits</th><th>Cache</th></tr></thead><tbody>
            ${
              calls
                .map(
                  (c2) => `<tr>
              <td class="muted">${clock(c2.at)}</td>
              <td class="mono">${esc(c2.endpoint)}</td>
              <td class="num">${c2.httpStatus ?? "—"}</td>
              <td>${esc(c2.outcome ?? "—")}</td>
              <td class="num">${c2.latencyMs !== null && c2.latencyMs !== undefined ? c2.latencyMs + "ms" : "—"}</td>
              <td class="num">${c2.creditCount ?? "—"}</td>
              <td>${c2.cacheHit ? "hit" : ""}</td>
            </tr>`,
                )
                .join("") ||
              `<tr><td colspan="7" class="muted">no calls recorded — fixture mode does not hit the network</td></tr>`
            }
          </tbody></table>
        </div>`;
    } catch (e) {
      el.innerHTML = errorCard(e, true);
      $("[data-retry]", el)?.addEventListener("click", render);
    }
  };
  await render();
}
