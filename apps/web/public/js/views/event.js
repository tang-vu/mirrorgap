/* Incident detail — lifecycle timeline, replay, claim ledger, evidence link. */
import {
  $,
  $$,
  api,
  ago,
  clock,
  dateTime,
  errorCard,
  esc,
  fmt,
  fmtPct,
  sevClass,
  stateClass,
  SEV_COLOR,
} from "../util.js";
import { lineChart } from "../charts.js";

const TYPE_ICON = {
  candidate_created: "◌",
  observation: "·",
  confirmed: "●",
  severity_escalated: "▲",
  severity_decreased: "▽",
  peak_divergence: "★",
  deviation_increased: "↗",
  deviation_decreased: "↘",
  resolved: "✓",
  invalidated: "✗",
  receipt_issued: "⬡",
};

export async function mount(el, ctx, params) {
  const eventId = params[0];
  try {
    const d = await api(`/api/v1/events/${eventId}`);
    ctx.setMode(d.dataMode);
    const e = d.event;
    const tl = d.timeline ?? [];
    const devPts = tl
      .filter((t) => t.deviationPct !== null && t.deviationPct !== undefined)
      .map((t) => ({ t: t.at, y: t.deviationPct, sev: t.severity }));

    el.innerHTML = `
      <button class="back" data-nav="events">← incidents</button>
      <div class="card incident-head">
        <div class="card-head">
          <h2><span class="mono">${esc(e.eventId)}</span> — ${esc(e.assetSymbol)} ${esc(e.kind)}</h2>
          <div>
            <span class="badge badge-mode ${e.dataMode}">${e.dataMode}</span>
            <span class="${sevClass(e.severity)}">${e.severity}</span>
            <span class="state st-${e.status}">${e.status}</span>
            <a class="btn-sm btn-accent" href="#/capsule/${esc(e.eventId)}">⬡ Evidence Capsule</a>
          </div>
        </div>
        ${d.explanation ? `<div class="claim derived" style="margin-bottom:14px"><div class="claim-kind">${d.explanation.mode === "llm_assisted" ? "narrative (llm-assisted)" : "narrative"}</div><p><strong>${esc(d.explanation.headline)}</strong></p><p class="muted">${esc(d.explanation.narrative)}</p></div>` : ""}
        <dl class="kv">
          <dt>Classification</dt><dd>${esc(e.classification)}</dd>
          <dt>First seen</dt><dd>${dateTime(e.firstSeenAt)}</dd>
          <dt>Last seen</dt><dd>${dateTime(e.lastSeenAt)}</dd>
          <dt>Confirmations</dt><dd>${e.confirmations}</dd>
          <dt>Peak deviation</dt><dd>${fmtPct(e.maxDeviationPct)}</dd>
          <dt>Duration</dt><dd>${d.stats ? `${(d.stats.durationMs / 60000).toFixed(1)} min` : "—"}</dd>
          <dt>Recurrences</dt><dd>${d.stats?.recurrences ?? 0} (same asset+kind reopened)</dd>
          ${e.resolvedAt ? `<dt>Resolved</dt><dd>${dateTime(e.resolvedAt)}</dd>` : ""}
        </dl>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head">
          <h2>Incident replay</h2>
          <div class="replay-controls">
            <button class="btn-sm" id="replay-play">▶ play</button>
            <button class="btn-sm" id="replay-prev">‹</button>
            <span id="replay-pos" class="muted mono">–</span>
            <button class="btn-sm" id="replay-next">›</button>
          </div>
        </div>
        <div id="replay-chart">${lineChart(devPts, { yLabel: "deviation %" })}</div>
        <div id="replay-frame" class="replay-frame muted">press play to step through the incident</div>
        <div class="timeline" id="timeline">
          ${tl
            .map(
              (t, i) => `<div class="tl-item tl-${esc(t.type)}" data-i="${i}" tabindex="0">
            <div class="tl-time mono">${clock(t.at)}</div>
            <div class="tl-icon">${TYPE_ICON[t.type] ?? "·"}</div>
            <div class="tl-body">
              <div class="tl-title">${esc(t.title)} <span class="${sevClass(t.severity)}">${t.severity ?? ""}</span></div>
              ${t.detail ? `<div class="tl-detail muted">${esc(t.detail)}</div>` : ""}
            </div>
          </div>`,
            )
            .join("")}
        </div>
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="card-head"><h2>Claim ledger</h2><span class="muted">deterministic investigation</span></div>
          ${claimsBlock(d)}
        </div>
        <div class="card">
          <div class="card-head"><h2>Evidence</h2><a class="link" href="#/capsule/${esc(e.eventId)}">open capsule →</a></div>
          ${receiptBlock(d)}
        </div>
      </div>
    `;

    $("[data-nav]", el)?.addEventListener("click", (ev) => ctx.navigate(ev.target.dataset.nav));
    wireReplay(el, tl, devPts);
    $$(".tl-item", el).forEach((n) =>
      n.addEventListener("click", () => showFrame(el, tl, Number(n.dataset.i))),
    );
  } catch (err) {
    el.innerHTML = errorCard(err, true);
    $("[data-retry]", el)?.addEventListener("click", () => mount(el, ctx, params));
  }
}

/* ---- replay ---- */
function wireReplay(el, tl, devPts) {
  let i = -1;
  let timer = null;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    const b = $("#replay-play", el);
    if (b) b.textContent = "▶ play";
  };
  const step = (dir) => {
    if (!$("#replay-frame", el)) return stop(); // view replaced mid-play
    const next = Math.min(tl.length - 1, Math.max(0, i + dir));
    showFrame(el, tl, next);
    i = next;
    if (i >= tl.length - 1) stop();
  };
  $("#replay-play", el)?.addEventListener("click", () => {
    if (timer) return stop();
    if (i >= tl.length - 1) i = -1;
    $("#replay-play", el).textContent = "⏸ pause";
    step(1);
    timer = setInterval(() => step(1), 900);
  });
  $("#replay-prev", el)?.addEventListener("click", () => step(-1));
  $("#replay-next", el)?.addEventListener("click", () => step(1));
}

function showFrame(el, tl, i) {
  const t = tl[i];
  if (!t) return;
  $$(".tl-item", el).forEach((n, j) => n.classList.toggle("tl-current", j === i));
  tl[i] && $(`.tl-item[data-i="${i}"]`, el)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const f = t.frame;
  const pos = $("#replay-pos", el);
  const frame = $("#replay-frame", el);
  if (!pos || !frame) return;
  pos.textContent = `${i + 1}/${tl.length}`;
  frame.innerHTML = f
    ? `<div class="replay-grid">
        <div><span class="muted">time</span> ${clock(t.at)}</div>
        <div><span class="muted">deviation</span> <strong>${t.deviationPct !== null && t.deviationPct !== undefined ? t.deviationPct.toFixed(2) + "%" : "—"}</strong></div>
        <div><span class="muted">reference</span> ${esc(f.referenceState ?? "?")}</div>
        <div><span class="muted">market</span> ${esc(f.underlyingMarket ?? "?")}</div>
        <div><span class="muted">freshness</span> ${esc(f.aggregateFreshness ?? "?")}</div>
        <div><span class="muted">dispersion</span> ${f.dispersionPct !== null && f.dispersionPct !== undefined ? f.dispersionPct.toFixed(2) + "%" : "—"}</div>
      </div>
      ${(f.gaps ?? []).length ? `<div class="replay-gaps">${f.gaps.map((g) => `<span class="mono">${esc(g.tokenSymbol)} ${g.gapPct >= 0 ? "+" : ""}${g.gapPct.toFixed(2)}%</span>`).join(" · ")}</div>` : ""}
      <div class="tl-detail" style="margin-top:6px">${esc(t.detail ?? t.title)}</div>`
    : `<div class="tl-detail">${esc(t.detail ?? t.title)}</div>`;
  // highlight the chart position
  $$("#replay-chart circle", el).forEach((c) => c.setAttribute("r", "2.6"));
}

function claimsBlock(d) {
  const claims = (d.investigation?.claims ?? [])
    .map(
      (cl) => `<div class="claim ${esc(cl.kind)}"><div class="claim-kind">${esc(cl.kind)}</div>
      <p>${esc(cl.statement)}</p>
      <div class="hash">evidence: ${(cl.evidenceIds ?? []).map(esc).join(", ") || "—"}</div></div>`,
    )
    .join("");
  const limitations = (d.investigation?.limitations ?? []).map((l) => `<li>${esc(l)}</li>`).join("");
  if (!claims && !limitations) return `<p class="muted">Investigation pending — event not yet confirmed.</p>`;
  return claims + (limitations ? `<h3 style="margin-top:14px">Limitations</h3><ul>${limitations}</ul>` : "");
}

function receiptBlock(d) {
  const r = d.receipt;
  if (!r) return `<p class="muted">A receipt is issued when the event is confirmed.</p>`;
  const v = d.verification;
  return `<dl class="kv">
    <dt>Receipt</dt><dd>${esc(r.receiptId)}</dd>
    <dt>Generated</dt><dd>${dateTime(r.generatedAt)}</dd>
    <dt>Hash</dt><dd class="hash">${esc(r.receiptHash)}</dd>
    <dt>Signature</dt><dd>${r.signature ? `${esc(r.signature.alg)} · ${esc(r.signature.publicKey.slice(0, 20))}…` : "unsigned"}</dd>
    <dt>Verification</dt><dd>${v ? (v.ok ? `<span class="verify-ok">✓ VALID</span>` : `<span class="verify-bad">✗ ${esc(v.errors.join("; "))}</span>`) : "—"}</dd>
  </dl>
  <p class="muted" style="margin-top:10px">Verify independently: <code>mirrorgap receipt ${esc(d.event.eventId)} --verify</code></p>`;
}
