import { $, $$, api, esc, fmtPct, dateTime } from "./util.js";

let retainedId;
export async function mountJourney(el, allEvents, selection = {}) {
  const events = allEvents.filter((e) => !selection.asset || e.rwaId === selection.asset);
  const event =
    events.find((e) => e.eventId === retainedId) ?? events.find((e) => e.status !== "candidate") ?? events[0];
  if (!event) {
    el.innerHTML =
      '<div class="empty"><h3>No retained incident for this asset.</h3><p>The selected observation has no incident trail. No confirmation or receipt is inferred.</p></div>';
    return;
  }
  retainedId = event.eventId;
  try {
    const d = await api(`/api/v1/events/${encodeURIComponent(retainedId)}`);
    const frame = (d.timeline ?? []).find((t) =>
      t.frame?.gaps?.some((g) => !selection.wrapper || g.tokenSymbol === selection.wrapper),
    );
    const gap = selection.wrapper
      ? frame?.frame.gaps.find((g) => g.tokenSymbol === selection.wrapper)
      : frame?.frame.gaps[0];
    const evidenceGap = d.receipt?.metrics.gaps.find((g) => g.tokenSymbol === gap?.tokenSymbol);
    const chapters = [
      [
        "Observe",
        "Retain the observation.",
        `At ${dateTime(frame?.at)}, ${gap ? `${gap.tokenSymbol} registered ${fmtPct(gap.gapPct)} versus the CMC tokenized aggregate.` : "no comparable wrapper frame is retained."} This is historical ${d.dataMode} evidence.`,
        `asset/${event.rwaId}`,
        "Inspect the asset",
      ],
      [
        "Detect",
        "Name the disagreement.",
        `${event.assetSymbol} · ${event.kind.replaceAll("_", " ")}. The recorded event is ${event.status}. Disagreement does not establish which wrapper is correct.`,
        `event/${retainedId}`,
        "Replay the incident",
      ],
      [
        "Investigate",
        "Keep the context attached.",
        frame
          ? `The same frame records ${frame.frame.aggregateFreshness} freshness and a ${frame.frame.underlyingMarket} underlying market. Peer observations share a provider; agreement is not independent corroboration.`
          : "No historical frame is available. A lifecycle record alone cannot supply a missing price.",
        `event/${retainedId}`,
        "Read the claim ledger",
      ],
      [
        "Prove",
        "Preserve what was measured.",
        d.receipt
          ? `${d.receipt.receiptId} retains ${evidenceGap ? `${evidenceGap.tokenSymbol} at ${fmtPct(evidenceGap.gapPct)}` : "the issuance measurements"}. Issued ${dateTime(d.receipt.generatedAt)}. This can differ from the earlier frame; no history is rewritten.`
          : "No receipt has been issued for this incident. Confirmation and proof are not invented.",
        d.receipt ? `capsule/${retainedId}` : `event/${retainedId}`,
        d.receipt ? "Open the evidence capsule" : "Inspect the pending incident",
      ],
    ];
    const extent = Math.max(1, Math.abs(gap?.gapPct ?? 0), Math.abs(evidenceGap?.gapPct ?? 0));
    const annotation = (i) => {
      const g = i === 3 ? evidenceGap : gap;
      return `<div class="evidence-registration"><span class="eyebrow">${i === 3 ? "ISSUANCE RECEIPT" : "RETAINED FRAME"} / ${esc(selection.wrapper ?? g?.tokenSymbol ?? "unavailable")}</span>${g ? `<div class="annotation-track"><span class="zero-line"></span><i style="left:${50 + (g.gapPct / extent) * 43}%" class="${g.gapPct < 0 ? "below" : "above"}"></i></div><strong>${fmtPct(g.gapPct)}</strong>` : "<p>No retained measurement</p>"}<small>CMC aggregate / signed % · shared ±${fmtPct(extent).replace("+", "")}</small></div>`;
    };
    el.innerHTML = `<div class="journey-title"><p class="eyebrow">02 / A CONTINUOUS EVIDENCE TRAIL</p><h2>Follow one finding.<br>Keep its context.</h2><p>${esc(event.assetSymbol)} / ${esc(retainedId)} / ${esc(d.dataMode)}<br>Retained history, separate from the current bench.</p></div><div class="journey-layout"><nav class="chapter-nav" aria-label="Evidence chapters">${chapters.map((c, i) => `<button data-chapter="${i}" aria-controls="chapter-${i}"><span>0${i + 1}</span>${c[0]}</button>`).join("")}</nav><div>${chapters.map((c, i) => `<section class="journey-chapter" id="chapter-${i}" tabindex="-1"><p class="eyebrow">0${i + 1} / ${c[0]} / ${esc(gap?.tokenSymbol ?? event.assetSymbol)}</p><h3>${c[1]}</h3>${annotation(i)}<p>${esc(c[2])}</p><a class="text-action" href="#/${c[3]}">${c[4]} ↗</a></section>`).join("")}</div></div>`;
    $$("[data-chapter]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const target = $(`#chapter-${b.dataset.chapter}`, el);
        target.focus({ preventScroll: true });
        target.scrollIntoView({
          block: "center",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
      }),
    );
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting)
            $$("[data-chapter]", el).forEach((b) =>
              b.setAttribute("aria-current", String(`chapter-${b.dataset.chapter}` === entry.target.id)),
            );
        }),
      { rootMargin: "-20% 0px -40% 0px" },
    );
    $$(".journey-chapter", el).forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  } catch {
    el.innerHTML =
      '<p class="empty">Retained incident unavailable. <a href="#/events">Browse the incident register →</a></p>';
  }
}
