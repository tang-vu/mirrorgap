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
            <button class="btn-sm" id="cap-audit">Audit calculations</button>
          </div>
        </div>

        <div class="verify-strip ${v.ok ? "ok" : "bad"}">
          <span class="verify-big">${v.ok ? "Integrity checks passed" : "✗ INVALID"}</span>
          <span class="muted">
            schema ${v.schemaOk ? "✓" : "✗"} · sha256 ${v.hashOk ? "✓" : "✗"} ·
            ${v.signatureOk === null ? "unsigned" : `signature ${v.signatureOk ? "✓" : "✗"}`}
          </span>
          <span class="badge badge-mode ${cap.dataMode}">${cap.dataMode === "live" ? "CMC LIVE" : "FIXTURE"}</span>
        </div>

        <div class="check-grid"><div><p class="eyebrow">01 / Payload integrity</p><strong>Schema ${v.schemaOk ? "valid" : "invalid"} · hash ${v.hashOk ? "matches" : "fails"}</strong><p>Checks structure and canonical JSON integrity.</p></div><div><p class="eyebrow">02 / Arithmetic</p><strong id="arithmetic-status">Not yet audited</strong><p>Run Audit calculations to recompute measurement arithmetic.</p></div><div><p class="eyebrow">03 / Signature</p><strong>${v.signatureOk === null ? "Unsigned" : v.signatureOk ? "Signature valid" : "Signature invalid"}</strong><p>A valid signature binds a key, not upstream factual truth.</p></div><div><p class="eyebrow">04 / Source attribution</p><strong>${cap.dataMode === "fixture" ? "Synthetic fixture" : "Provider attributed"}</strong><p>Upstream truth and issuer backing are not authenticated.</p></div></div>
        <section id="audit-result" aria-live="polite"></section>
        <p class="muted">Receipt measurements describe the issuance snapshot. Lifecycle status below may have advanced since issuance. Hash verification does not authenticate upstream data.</p>
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
            <h3>Issuance observations</h3>
            <dl class="kv">
              <dt>Lifecycle peak (current)</dt><dd><strong>${cap.observed.peakDeviationPct.toFixed(3)}%</strong></dd>
              <dt>Issuance divergence</dt><dd>${cap.observed.divergencePct.toFixed(3)}%</dd>
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
          <div class="replay-controls" aria-label="Claim categories">${["all", ...claimKinds].map((k) => `<button class="btn-sm" data-claim-kind="${k}" aria-pressed="${k === "all"}">${esc(k.replaceAll("_", " "))}</button>`).join("")}</div><p id="claim-filter-status" class="muted" role="status"></p>
          ${(cap.receipt.claims ?? [])
            .map(
              (cl) =>
                `<div class="claim ${esc(cl.kind)}"><div class="claim-kind">${esc(cl.kind)}</div><p>${esc(cl.statement)}</p><div class="hash">Evidence: ${(cl.evidenceIds ?? []).map((id) => `<a href="#evidence-${encodeURIComponent(id)}" data-evidence="${esc(id)}">${esc(id)}</a>`).join(" · ") || "No evidence reference"}</div></div>`,
            )
            .join("")}
          ${(cap.limitations ?? []).length ? `<h3 style="margin-top:14px">Limitations</h3><ul>${cap.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        </section>

        <section class="capsule-integrity" id="observations"><h3>Evidence references · fixed at issuance</h3><p class="muted">${esc(cap.receipt.generatedAt)} · ${esc(cap.dataMode)}. Price units are shown by currency; no FX or corporate-action adjustment.</p><div class="table-scroll"><table class="table"><thead><tr><th>Observation</th><th>Role</th><th>Price / currency</th><th>Timestamp / basis</th></tr></thead><tbody>${cap.receipt.observations.map((o) => `<tr id="evidence-${encodeURIComponent(o.observationId)}" tabindex="-1"><td class="hash">${esc(o.observationId)}</td><td>${esc(o.role)} / ${esc(o.kind)}</td><td>${o.price === null ? "absent" : esc(o.price)} ${esc(o.currency)}</td><td>${esc(o.observedAt)}<br>${esc(o.timestampSource)}</td></tr>`).join("")}</tbody></table></div></section>
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
          <label for="tamper-json">Receipt JSON · editable local copy</label><textarea id="tamper-json" spellcheck="false">${esc(JSON.stringify(cap.receipt, null, 2))}</textarea>
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

    $$("[data-claim-kind]", el).forEach((button) =>
      button.addEventListener("click", () => {
        const kind = button.dataset.claimKind;
        let count = 0;
        $$(".capsule-claims .claim", el).forEach((cl) => {
          cl.hidden = kind !== "all" && !cl.classList.contains(kind);
          if (!cl.hidden) count++;
        });
        $$("[data-claim-kind]", el).forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        $("#claim-filter-status", el).textContent =
          `${count} ${kind === "all" ? "total" : kind.replaceAll("_", " ")} claims`;
      }),
    );
    $$("[data-evidence]", el).forEach((link) =>
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const row = el.querySelector(`[id="evidence-${encodeURIComponent(link.dataset.evidence)}"]`);
        if (row) {
          row.focus({ preventScroll: true });
          row.scrollIntoView({ block: "center" });
        }
      }),
    );
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
    $("#tamper-json", el).addEventListener("input", () => {
      $("#arithmetic-status", el).textContent = "Edited copy · audit required";
      $("#audit-result", el).textContent = "";
      $("#tamper-result", el).textContent = "";
    });
    const canonical = JSON.stringify(cap.receipt, null, 2);
    $("#cap-audit", el)?.addEventListener("click", async () => {
      const out = $("#audit-result", el);
      try {
        const receipt = JSON.parse($("#tamper-json", el).value);
        const result = await api("/api/v1/receipts/audit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(receipt),
        });
        $("#arithmetic-status", el).textContent = result.arithmeticOk
          ? "Arithmetic consistent"
          : "Arithmetic failed";
        out.innerHTML = `<h3>${result.ok ? "AUDIT PASS" : "AUDIT FAIL"}</h3>
          <p>Hash ${result.integrity.hashOk ? "matches" : "fails"} · calculations ${result.arithmeticOk ? "consistent" : "inconsistent"}</p>
          <ul>${result.checks
            .filter((c) => !c.ok)
            .map((c) => `<li>${esc(c.id)}: ${esc(c.detail)}</li>`)
            .join("")}</ul>
          <p class="muted">${result.limitations.map(esc).join(" ")}</p>`;
      } catch (err) {
        $("#arithmetic-status", el).textContent = "Audit unavailable";
        out.textContent = `Audit failed: ${err.message}`;
      }
    });
    $("#tamper-reset", el)?.addEventListener("click", () => {
      $("#tamper-json", el).value = canonical;
      $("#tamper-result", el).textContent = "";
      $("#audit-result", el).textContent = "";
      $("#arithmetic-status", el).textContent = "Not yet audited";
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
