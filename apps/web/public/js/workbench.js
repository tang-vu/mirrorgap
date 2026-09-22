import { $, api, esc, fmt, fmtPct } from "./util.js";

export async function mountWorkbench(el, rwaId) {
  try {
    let report = await api(`/api/v1/assets/${rwaId}/workbench`);
    el.innerHTML = `<div class="card-head"><h2>Investigation Workbench</h2><button class="btn-sm" id="review-download">Export review JSON</button></div>
      <p class="muted">1. Compare wrappers → 2. Challenge the reference → 3. Export the evidence</p>
      <div id="review-summary"></div>
      <details class="underlying-form"><summary>Compare an independent underlying quote</summary>
        <p>Enter a quote you have obtained independently. MirrorGap does not fetch or authenticate this source. Supply the units represented by each token; issuer terms may differ. Maximum quote age and time separation: ${report.policy.maxAgeSeconds} seconds.</p>
        <form id="underlying-compare">
          <fieldset><legend>01 / Quote details</legend><p>Asset: ${esc(report.asset?.symbol ?? rwaId)} · RWA ${rwaId}. Observation time must align with the stored snapshot; accepted quotes remain unauthenticated.</p><div class="review-fields">
            <label>Underlying price<input name="price" type="number" min="0.00000001" step="any" required></label>
            <label>Currency<input name="currency" value="USD" pattern="[A-Z]{3}" required></label>
            <label>Underlying unit<input name="unit" placeholder="share, troy ounce, fund unit…" maxlength="80" required></label>
            <label>Quote time (ISO UTC)<input name="observedAt" placeholder="2026-09-22T15:00:00.000Z" required></label>
            <label>Source name<input name="source" maxlength="160" required></label>
            <label>Source HTTPS URL (no query or secrets)<input name="sourceUrl" type="url" required></label>
            <label>Quote data mode<select name="dataMode"><option value="live">Live analyst quote</option><option value="fixture">Synthetic fixture</option></select></label>
          </div></fieldset><fieldset><legend>02 / Unit mapping</legend><p>No default ratio. Check each wrapper’s issuer terms.</p><div class="review-fields">
            ${report.wrappers.map((w) => `<label>${esc(w.symbol)}: underlying units per token<input name="units-${w.cryptoId}" type="number" min="0.00000001" step="any" placeholder="Explicit ratio required" required></label>`).join("")}
          </div>
          <div id="formula-preview" class="formula-preview" aria-live="polite">Expected token price = underlying price × explicit units per token.</div></fieldset>
          <fieldset><legend>03 / Review</legend><p>Server checks asset, currency, data mode, evidence completeness, freshness, time separation and underlying market state. A source URL is attribution only; it is never fetched.</p><button class="btn-sm btn-accent" type="submit">Review underlying comparison</button>
          <p id="compare-error" role="alert"></p></fieldset>
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
        ${report.underlying.comparisons.map((c) => `<p><strong>${esc(c.symbol)}: ${esc(c.status)}</strong> ${c.gapPct === null ? "" : fmtPct(c.gapPct)}<br>Expected token price: ${c.expectedTokenPrice === null ? "unavailable" : esc(c.expectedTokenPrice)} ${esc(report.underlying.quote.currency)}<br> ${c.reasons.map(esc).join(" · ")}<br><span class="muted">${c.limitations.map(esc).join(" ")}</span></p>`).join("")}`
        : "";
    }
    show();
    const quoteForm = $("#underlying-compare", el);
    quoteForm.querySelectorAll("input,select").forEach((input) => {
      const note = document.createElement("small");
      note.className = "field-reason";
      note.id = `reason-${input.name}`;
      input.setAttribute("aria-describedby", note.id);
      input.after(note);
    });
    quoteForm.addEventListener("input", () => {
      const price = Number(quoteForm.elements.price.value);
      $("#formula-preview", el).innerHTML = report.wrappers
        .map((w) => {
          const ratio = Number(quoteForm.elements.namedItem(`units-${w.cryptoId}`).value);
          return `<div>${esc(w.symbol)}: ${price > 0 && ratio > 0 && Number.isFinite(price * ratio) ? `${esc(price)} × ${esc(ratio)} = ${esc(price * ratio)} ${esc(quoteForm.elements.currency.value)} (preview only)` : "Enter a positive price and explicit units per token."}</div>`;
        })
        .join("");
    });
    $("#underlying-compare", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const error = $("#compare-error", el);
      error.textContent = "Checking retained evidence…";
      const submit = e.currentTarget.querySelector("[type=submit]");
      submit.disabled = true;
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
        const reasons = [...new Set(report.underlying?.comparisons.flatMap((c) => c.reasons) ?? [])];
        const fields = {
          dataMode: ["data_mode_mismatch", "inconsistent_observation_mode"],
          currency: ["currency_mismatch"],
          observedAt: ["underlying_quote_not_current", "timestamps_not_aligned", "snapshot_not_current"],
          price: ["invalid_mapped_price"],
        };
        quoteForm.querySelectorAll("input,select").forEach((input) => {
          const messages = input.name.startsWith("units-")
            ? (report.underlying?.comparisons
                .find((c) => `units-${c.cryptoId}` === input.name)
                ?.reasons.filter((r) => ["unit_mapping_missing", "invalid_mapped_price"].includes(r)) ?? [])
            : reasons.filter((r) => (fields[input.name] ?? []).includes(r));
          input.setAttribute("aria-invalid", String(messages.length > 0));
          document.getElementById(`reason-${input.name}`).textContent = messages.join(" · ");
        });
        error.textContent = "Review complete. See the per-wrapper outcomes below.";
        report.underlying?.comparisons.forEach((c) => {
          const input = quoteForm.elements.namedItem(`units-${c.cryptoId}`);
          input?.setAttribute("aria-invalid", String(c.reasons.includes("unit_mapping_missing")));
        });
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submit.disabled = false;
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
