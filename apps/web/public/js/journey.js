import { $, $$, api, esc, fmtPct, dateTime } from "./util.js";
import { journeyMotion } from "./motion.js";

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
        `${event.assetSymbol} Â· ${event.kind.replaceAll("_", " ")}. The recorded event is ${event.status}. Disagreement does not establish which wrapper is correct.`,
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
      return `<div class="evidence-registration"><span class="eyebrow">${i === 3 ? "ISSUANCE RECEIPT" : "RETAINED FRAME"} / ${esc(selection.wrapper ?? g?.tokenSymbol ?? "unavailable")}</span>${g ? `<div class="annotation-track"><span class="zero-line"></span><i style="left:${50 + (g.gapPct / extent) * 43}%" class="${g.gapPct < 0 ? "below" : "above"}"></i></div><strong>${fmtPct(g.gapPct)}</strong>` : "<p>No retained measurement</p>"}<small>CMC aggregate / signed % Â· shared Â±${fmtPct(extent).replace("+", "")}</small></div>`;
    };
    const specimenX = gap ? 50 + (gap.gapPct / extent) * 40 : 50;
    const claim = d.investigation?.claims?.find((c) => c.evidenceIds?.length) ?? d.investigation?.claims?.[0];
    const observationId = frame?.snapshotId ?? "frame only";
    el.innerHTML = `<div class="journey-title"><p class="eyebrow">02 / A CONTINUOUS EVIDENCE TRAIL</p><h2>Follow one finding.<br>Keep its context.</h2><p>${esc(event.assetSymbol)} / ${esc(retainedId)} / ${esc(d.dataMode)}<br>Retained history, separate from the current bench.</p></div><div class="journey-layout"><nav class="chapter-nav" aria-label="Evidence chapters">${chapters.map((c, i) => `<button data-chapter="${i}" aria-controls="chapter-${i}"><span>0${i + 1}</span>${c[0]}</button>`).join("")}</nav><div class="story-stage" role="img" aria-label="One retained observation travels through four evidence stages"><div class="story-head"><span>RETAINED SPECIMEN / ${esc(gap?.tokenSymbol ?? "UNAVAILABLE")}</span><span>${esc(d.dataMode.toUpperCase())}</span></div><div class="story-optic"><div class="story-specimen"></div><div class="story-axis"></div></div><div class="story-beam"></div><div class="story-bracket" style="left:${specimenX - 40}%"></div>${gap ? `<div class="story-pin" style="left:${specimenX}%"></div>` : ""}<div class="story-measure">${gap ? fmtPct(gap.gapPct) : "NO MEASUREMENT"}</div><svg class="story-paths" viewBox="0 0 500 500" preserveAspectRatio="none" aria-hidden="true">${(
      claim?.evidenceIds ?? []
    )
      .slice(0, 2)
      .map(
        (id, i) =>
          `<path class="story-link" data-reference="${esc(id)}" d="${i === 0 ? "M250 290 C290 350 340 340 365 395" : "M250 290 C200 340 170 370 145 420"}"/>`,
      )
      .join(
        "",
      )}</svg><div class="story-slips"><div class="story-slip">RETAINED SNAPSHOT / ${esc(observationId)}<br>${dateTime(frame?.at)} Â· ${esc(gap?.tokenSymbol ?? "unavailable")}</div><div class="story-slip">SOURCE / CMC tokenized aggregate<br>${esc(frame?.frame?.aggregateFreshness ?? "unavailable")} Â· ${esc(frame?.frame?.underlyingMarket ?? "unknown")} market</div><div class="story-slip">CLAIM / ${esc(claim?.kind ?? "unclassified")}<br>${esc(claim?.evidenceIds?.join(" Â· ") || "No linked evidence reference")}</div><div class="story-slip missing">INDEPENDENT UNDERLYING / EMPTY SLOT<br>No attributed independent quote in this receipt</div></div><div class="story-dossier">EVIDENCE DOSSIER<strong>${esc(d.receipt?.receiptId ?? "RECEIPT PENDING")}</strong><span>Earlier frame / ${gap ? fmtPct(gap.gapPct) : "unavailable"}</span><span>Issuance / ${evidenceGap ? fmtPct(evidenceGap.gapPct) : "unavailable"}</span><span>${esc(d.receipt?.receiptHash?.slice(0, 24) ?? "No issued hash")}â€¦</span></div></div><div class="journey-chapters">${chapters.map((c, i) => `<section class="journey-chapter" id="chapter-${i}" data-index="${i}" tabindex="-1"><p class="eyebrow">0${i + 1} / ${c[0]} / ${esc(gap?.tokenSymbol ?? event.assetSymbol)}</p><h3>${c[1]}</h3>${annotation(i)}<p>${esc(c[2])}</p><a class="text-action" href="#/${c[3]}">${c[4]} â†—</a></section>`).join("")}</div></div>`;
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
    return () => el.__storyCleanup?.();
  } catch {
    el.innerHTML =
      '<p class="empty">Retained incident unavailable. <a href="#/events">Browse the incident register â†’</a></p>';
  }
}

export function startJourneyMotion(el) {
  el.__storyCleanup?.();
  el.__storyCleanup = journeyMotion(el);
}
