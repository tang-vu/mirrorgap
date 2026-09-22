import { $, api, esc, fmt, fmtPct } from "./util.js";

export async function mountWorkbench(el, rwaId) {
  try {
    let report = await api(`/api/v1/assets/${rwaId}/workbench`);
    el.innerHTML = `<div class="card-head"><h2>Investigation Workbench</h2><button class="btn-sm" id="review-download">Export review JSON</button></div>
      <p class="muted">1. Compare wrappers → 2. Challenge the reference → 3. Export the evidence</p>
      <div id="review-summary"></div>
      <details class="underlying-form"><summary>Compare an independent underlying quote</summary>
        <p>Enter a quote you have obtained independently. MirrorGap does not fetch or authenticate this source. Supply the units represented by each token; issuer terms may differ.</p>
        <form id="underlying-compare">
          <div class="review-fields">
            <label>Underlying price<input name="price" type="number" min="0.00000001" step="any" required></label>
            <label>Currency<input name="currency" value="USD" pattern="[A-Z]{3}" required></label>
            <label>Underlying unit<input name="unit" placeholder="share, troy ounce, fund unit…" maxlength="80" required></label>
            <label>Quote time (ISO UTC)<input name="observedAt" placeholder="2026-09-22T15:00:00.000Z" required></label>
            <label>Source name<input name="source" maxlength="160" required></label>
            <label>Source HTTPS URL (no query or secrets)<input name="sourceUrl" type="url" required></label>
            <label>Quote data mode<select name="dataMode"><option value="live">Live analyst quote</option><option value="fixture">Synthetic fixture</option></select></label>
            ${report.wrappers.map((w) => `<label>${esc(w.symbol)}: underlying units per token<input name="units-${w.cryptoId}" type="number" min="0.00000001" step="any" placeholder="Explicit ratio required" required></label>`).join("")}
          </div>
          <button class="btn-sm" type="submit">Compare with CMC observations</button>
          <p id="compare-error" role="alert"></p>
        </form>
      </details>
      <div id="underlying-result" aria-live="polite"></div>`;
    function show() {
      $("#review-summary", el).innerHTML = `<h3>${esc(report.headline)}</h3>
        <p><span class="badge badge-mode ${report.dataMode}">${esc(report.dataMode)}</span> · ${esc(report.disposition)} · measured ${esc(report.measuredAt)}</p>
        <p>${esc(report.comparisonBasis)}</p>
        ${report.blockers.length ? `<ul class="verify-bad">${report.blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
        <div class="review-table"><table class="table"><thead><tr><th>Wrapper / issuer</th><th>CMC price</th><th>vs aggregate</th><th>Other-wrapper median</th><th>vs peers</th><th>Time basis</th></tr></thead><tbody>
          ${report.wrappers.map((w) => `<tr><td>${esc(w.symbol)}<br><span class="muted">${esc(w.issuer ?? "Issuer unknown")}</span></td><td>${fmt(w.price)} ${esc(w.currency)}</td><td>${w.aggregateGapPct === null ? "—" : fmtPct(w.aggregateGapPct)}</td><td>${w.peerMedian === null ? "—" : fmt(w.peerMedian)} (${w.peerCount} peers)</td><td>${w.peerGapPct === null ? "—" : fmtPct(w.peerGapPct)}</td><td>${esc(w.timestampSource)}</td></tr>`).join("")}
        </tbody></table></div>
        <h3>What to check next</h3><ol>${report.nextSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        <p class="muted">${report.limitations.map(esc).join(" ")}</p>
        <p class="muted">Agent policy: underlying parity unproven · trade execution disabled.</p>`;
      $("#underlying-result", el).innerHTML = report.underlying
        ? `<h3>Underlying comparison · analyst supplied, not authenticated</h3>
        <p>${esc(report.underlying.quote.source)} · ${esc(report.underlying.quote.observedAt)} · ${esc(report.underlying.quote.dataMode)}</p>
        ${report.underlying.comparisons.map((c) => `<p><strong>${esc(c.symbol)}: ${esc(c.status)}</strong> ${c.gapPct === null ? "" : fmtPct(c.gapPct)} ${c.reasons.map(esc).join(" · ")}<br><span class="muted">${c.limitations.map(esc).join(" ")}</span></p>`).join("")}`
        : "";
    }
    show();
    $("#underlying-compare", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const error = $("#compare-error", el);
      error.textContent = "";
      try {
        report = await api(`/api/v1/assets/${rwaId}/compare`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rwaId: Number(rwaId),
            price: Number(form.get("price")),
            currency: form.get("currency"),
            unit: form.get("unit"),
            observedAt: form.get("observedAt"),
            source: form.get("source"),
            sourceUrl: form.get("sourceUrl"),
            dataMode: form.get("dataMode"),
            mappings: report.wrappers.map((w) => ({
              cryptoId: w.cryptoId,
              underlyingUnitsPerToken: Number(form.get(`units-${w.cryptoId}`)),
            })),
          }),
        });
        show();
      } catch (err) {
        error.textContent = err.message;
      }
    });
    $("#review-download", el).addEventListener("click", () => {
      const a = document.createElement("a");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      );
      a.href = url;
      a.download = `mirrorgap-review-${rwaId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  } catch (err) {
    el.textContent = `Workbench unavailable: ${err.message}`;
  }
}
