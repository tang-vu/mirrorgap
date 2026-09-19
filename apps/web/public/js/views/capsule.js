/* Evidence Capsule — the public, shareable proof surface for an incident. */
import { $, $$, api, dateTime, errorCard, esc, fmt, sevClass, stateClass } from "../util.js";

export async function mount(el, ctx, params) {
  const eventId = params[0];
  try {
    const cap = await api(`/api/v1/capsules/${eventId}`);
    ctx.setMode(cap.dataMode);
    const v = cap.integrity.verification;
    const claimKinds = ["observed", "derived", "supported_hypothesis", "unknown"];

    el.innerHTML = `
      <button class="back" data-nav="event/${esc(eventId)}">← incident</button>
      <div class="capsule">
        <div class="capsule-head">
          <div class="capsule-title">
            <span class="capsule-mark">⬡</span>
            <div>
              <h2>MirrorGap Evidence Capsule</h2>
              <p class="muted">verifiable incident record · capsule v${cap.capsuleVersion} · receipt ${esc(cap.receiptId)}</p>
            </div>
          </div>
          <div class="capsule-actions">
            <button class="btn-sm" id="cap-copy-hash">copy hash</button>
            <button class="btn-sm" id="cap-copy-link">copy permalink</button>
            <button class="btn-sm" id="cap-download">download JSON</button>
            <button class="btn-sm" id="cap-raw">raw receipt</button>
          </div>
        </div>

        <div class="verify-strip ${v.ok ? "ok" : "bad"}">
          <span class="verify-big">${v.ok ? "✓ VERIFIED" : "✗ INVALID"}</span>
          <span class="muted">
            schema ${v.schemaOk ? "✓" : "✗"} · sha256 ${v.hashOk ? "✓" : "✗"} ·
            ${v.signatureOk === null ? "unsigned" : `signature ${v.signatureOk ? "✓" : "✗"}`}
          </span>
          <span class="badge badge-mode ${cap.dataMode}">${cap.dataMode === "live" ? "CMC LIVE" : "FIXTURE"}</span>
        </div>

        <div class="capsule-grid">
          <section>
            <h3>Incident</h3>
            <dl class="kv">
              <dt>Incident</dt><dd class="mono">${esc(cap.eventId)}</dd>
              <dt>Asset</dt><dd>${esc(cap.asset.name)} (${esc(cap.asset.symbol)})</dd>
              <dt>RWA ID</dt><dd>${cap.asset.rwaId}</dd>
              <dt>Kind</dt><dd>${esc(cap.lifecycle.kind)}</dd>
              <dt>Status</dt><dd><span class="state st-${esc(cap.lifecycle.status)}">${cap.lifecycle.status}</span></dd>
              <dt>Severity</dt><dd><span class="${sevClass(cap.lifecycle.severity)}">${cap.lifecycle.severity}</span></dd>
              <dt>Classification</dt><dd>${esc(cap.lifecycle.classification)}</dd>
              <dt>First seen</dt><dd>${dateTime(cap.lifecycle.firstSeenAt)}</dd>
              <dt>Last seen</dt><dd>${dateTime(cap.lifecycle.lastSeenAt)}</dd>
              <dt>Confirmations</dt><dd>${cap.lifecycle.confirmations}</dd>
              <dt>Duration</dt><dd>${(cap.lifecycle.durationMs / 60000).toFixed(1)} min</dd>
              <dt>Recurrences</dt><dd>${cap.lifecycle.recurrences}</dd>
            </dl>
          </section>
          <section>
            <h3>Observed</h3>
            <dl class="kv">
              <dt>Peak deviation</dt><dd><strong>${cap.observed.peakDeviationPct.toFixed(3)}%</strong></dd>
              <dt>Latest divergence</dt><dd>${cap.observed.divergencePct.toFixed(3)}%</dd>
              <dt>Reference state</dt><dd><span class="${stateClass(cap.observed.referenceState)}">${cap.observed.referenceState}</span></dd>
              <dt>Freshness</dt><dd><span class="${stateClass(cap.observed.aggregateFreshness)}">${cap.observed.aggregateFreshness}</span>${cap.observed.aggregateAgeSeconds !== null ? ` <span class="muted">${Math.round(cap.observed.aggregateAgeSeconds)}s old</span>` : ""}</dd>
              <dt>Underlying market</dt><dd>${esc(cap.observed.underlyingMarket)}${cap.observed.marketHoursHeuristic ? ` <span class="muted">${esc(cap.observed.marketHoursHeuristic)}</span>` : ""}</dd>
              <dt>Wrapper dispersion</dt><dd>${cap.observed.dispersionPct !== null ? cap.observed.dispersionPct.toFixed(3) + "%" : "—"} (${cap.observed.wrapperCount} wrappers)</dd>
            </dl>
            <h3 style="margin-top:14px">Representations</h3>
            <table class="table"><tbody>
              ${cap.representations.map((r) => `<tr><td class="mono">${esc(r.symbol)}</td><td>${esc(r.name)}</td><td class="muted">${esc(r.issuerName ?? "—")}</td></tr>`).join("")}
            </tbody></table>
          </section>
        </div>

        <section class="capsule-claims">
          <h3>Claim ledger
            <span class="muted">${claimKinds.map((k) => `${cap.claimSummary[k] ?? 0} ${k}`).join(" · ")}</span>
          </h3>
          ${(cap.claims ?? [])
            .map(
              (cl) =>
                `<div class="claim ${esc(cl.kind)}"><div class="claim-kind">${esc(cl.kind)}</div><p>${esc(cl.statement)}</p></div>`,
            )
            .join("")}
          ${(cap.limitations ?? []).length ? `<h3 style="margin-top:14px">Limitations</h3><ul>${cap.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        </section>

        <section class="capsule-integrity">
          <h3>Integrity</h3>
          <dl class="kv">
            <dt>Receipt hash</dt><dd class="hash">${esc(cap.integrity.receiptHash)}</dd>
            <dt>Signature</dt><dd>${cap.integrity.signature ? `${esc(cap.integrity.signature.alg)} · pubkey ${esc(cap.integrity.signature.publicKey.slice(0, 24))}…` : "unsigned — hash-verified only"}</dd>
            <dt>Provenance</dt><dd>${cap.provenance.map((p) => `<div class="hash">${esc(p.endpoint)} · ${esc(p.retrievedAt)} · ${esc(p.dataMode)}${p.requestId ? ` · ${esc(p.requestId)}` : ""}</div>`).join("")}</dd>
            <dt>Verify offline</dt><dd><code>mirrorgap receipt ${esc(cap.eventId)} --verify</code> or POST this receipt to /api/v1/receipts/verify</dd>
          </dl>
        </section>

        <section class="capsule-tamper">
          <h3>Tamper demonstration</h3>
          <p class="muted">Edit any field of the canonical receipt below and re-verify — the SHA-256 over the canonical JSON will no longer match the recorded hash.</p>
          <textarea id="tamper-json" spellcheck="false">${esc(JSON.stringify(cap.receipt, null, 2))}</textarea>
          <div class="replay-controls" style="margin-top:8px">
            <button class="btn-sm" id="tamper-reset">reset</button>
            <button class="btn-sm btn-accent" id="tamper-verify">verify this JSON</button>
            <span id="tamper-result"></span>
          </div>
        </section>

        <section id="cap-raw-section" class="hidden">
          <h3>Canonical receipt (exact hashed payload)</h3>
          <pre class="raw-json">${esc(JSON.stringify(cap.receipt, null, 2))}</pre>
        </section>
      </div>`;

    $("[data-nav]", el)?.addEventListener("click", (e) => ctx.navigate(e.target.dataset.nav));
    $("#cap-copy-hash", el)?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(cap.integrity.receiptHash);
      $("#cap-copy-hash", el).textContent = "copied ✓";
    });
    $("#cap-copy-link", el)?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(location.href);
      $("#cap-copy-link", el).textContent = "copied ✓";
    });
    $("#cap-download", el)?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(cap, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mirrorgap-capsule-${cap.eventId}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("#cap-raw", el)?.addEventListener("click", () => $("#cap-raw-section", el)?.classList.toggle("hidden"));
    const canonical = JSON.stringify(cap.receipt, null, 2);
    $("#tamper-reset", el)?.addEventListener("click", () => {
      $("#tamper-json", el).value = canonical;
      $("#tamper-result", el).textContent = "";
      $("#tamper-result", el).className = "";
    });
    $("#tamper-verify", el)?.addEventListener("click", async () => {
      const out = $("#tamper-result", el);
      try {
        const body = JSON.parse($("#tamper-json", el).value);
        const res = await api("/api/v1/receipts/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        out.className = res.ok ? "verify-ok" : "verify-bad";
        out.textContent = res.ok
          ? "✓ VALID — hash matches canonical payload"
          : `✗ INVALID — ${res.errors.join("; ") || "hash mismatch"}`;
      } catch (err) {
        out.className = "verify-bad";
        out.textContent = `✗ ${err.message}`;
      }
    });
  } catch (err) {
    el.innerHTML = errorCard(err, true);
    $("[data-retry]", el)?.addEventListener("click", () => mount(el, ctx, params));
  }
}
