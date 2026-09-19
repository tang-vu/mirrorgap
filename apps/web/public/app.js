/* MirrorGap observatory — hash router + SSE live updates + view mounting. */
import { $, $$, api, esc } from "./js/util.js";

const views = {
  overview: () => import("./js/views/overview.js"),
  radar: () => import("./js/views/radar.js"),
  events: () => import("./js/views/events.js"),
  watchlist: () => import("./js/views/watchlist.js"),
  diagnostics: () => import("./js/views/diagnostics.js"),
  about: () => import("./js/views/about.js"),
  asset: () => import("./js/views/asset.js"),
  event: () => import("./js/views/event.js"),
  capsule: () => import("./js/views/capsule.js"),
};

const TABS = ["overview", "radar", "events", "watchlist", "diagnostics", "about"];
let currentView = "";
let mounted = false;

const ctx = {
  navigate(path) {
    location.hash = `#/${path}`;
  },
  setMode(mode) {
    const badge = $("#mode-badge");
    badge.textContent = mode;
    badge.className = `badge badge-mode ${mode}`;
    $("#fixture-banner").classList.toggle("hidden", mode !== "fixture");
  },
  setCapability(marketPairs) {
    const mp = typeof marketPairs === "string" ? marketPairs : marketPairs?.marketPairs;
    $("#cap-badge").textContent =
      mp === "yes" ? "market-pairs ✓" : mp === "no" ? "market-pairs: plan-gated" : "market-pairs: ?";
    $("#cap-badge").className = `badge badge-cap ${mp === "yes" ? "ok" : mp === "no" ? "no" : ""}`;
  },
};

async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const view = parts[0] && views[parts[0]] ? parts[0] : "overview";
  const params = parts.slice(1).map(decodeURIComponent);
  const reload = view === currentView && mounted; // re-entering same view still re-mounts (fresh data)
  currentView = view;
  $$(".tab").forEach((t) =>
    t.classList.toggle(
      "active",
      t.dataset.view === view ||
        (view === "asset" && t.dataset.view === "radar") ||
        (view === "event" && t.dataset.view === "events"),
    ),
  );
  const el = $("#view");
  el.innerHTML = `<div class="card"><p class="muted">loading…</p></div>`;
  try {
    const mod = await views[view]();
    await mod.mount(el, ctx, params);
    mounted = true;
  } catch (err) {
    el.innerHTML = `<div class="card"><p class="verify-bad">${esc(err.message ?? err)}</p></div>`;
  }
}

$$(".tab").forEach((t) => t.addEventListener("click", () => ctx.navigate(t.dataset.view)));
window.addEventListener("hashchange", route);

/* ---------------- search ---------------- */
let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 1) return $("#search-results").classList.add("hidden");
  searchTimer = setTimeout(async () => {
    try {
      const d = await api(`/api/v1/assets?q=${encodeURIComponent(q)}`);
      const box = $("#search-results");
      box.innerHTML =
        (d.assets ?? [])
          .map(
            (a) =>
              `<div class="sr-item" data-rwa="${a.rwaId}"><span class="sr-sym">${esc(a.symbol)}</span><span class="sr-name">${esc(a.name)}</span></div>`,
          )
          .join("") || `<div class="sr-item"><span class="sr-name">no matches</span></div>`;
      box.classList.remove("hidden");
      $$(".sr-item[data-rwa]", box).forEach((it) =>
        it.addEventListener("click", () => {
          box.classList.add("hidden");
          $("#search").value = "";
          ctx.navigate(`asset/${it.dataset.rwa}`);
        }),
      );
    } catch {
      /* transient — next keystroke retries */
    }
  }, 200);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-box")) $("#search-results").classList.add("hidden");
});

/* ---------------- live stream ---------------- */
function connectStream() {
  const es = new EventSource("/api/v1/stream");
  es.onopen = () => $("#live-dot").classList.add("on");
  es.onerror = () => $("#live-dot").classList.remove("on");
  const refreshViews = new Set(["overview", "radar", "events", "diagnostics"]);
  for (const type of ["snapshot", "event", "scan_finished"]) {
    es.addEventListener(type, () => {
      if (refreshViews.has(currentView)) route();
    });
  }
}

/* ---------------- boot ---------------- */
if (!location.hash) location.hash = "#/overview";
route();
connectStream();
setInterval(() => {
  if (["overview", "radar"].includes(currentView)) route();
}, 30_000);
