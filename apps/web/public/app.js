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

let routeVersion = 0;
let currentView = "";
let currentPath = "";
let mounted = false;
let dispose;

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
  const params = parts.slice(1).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const version = ++routeVersion;
  const changed = location.hash !== currentPath;
  currentPath = location.hash;
  if (changed) {
    dispose?.();
    dispose = null;
  }
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
  if (changed || !mounted)
    el.innerHTML = `<div class="loading-state" role="status">READING THE EVIDENCE…</div>`;
  try {
    const mod = await views[view]();
    const surface = document.createElement("div");
    const scoped = {
      ...ctx,
      setMode: (mode) => {
        if (version === routeVersion) ctx.setMode(mode);
      },
      setCapability: (cap) => {
        if (version === routeVersion) ctx.setCapability(cap);
      },
    };
    await mod.mount(surface, scoped, params);
    if (version !== routeVersion) {
      surface.__cleanup?.();
      return;
    }
    dispose?.();
    dispose = surface.__cleanup;
    surface.querySelectorAll("table").forEach((table) => {
      if (!table.parentElement.matches(".table-scroll, .review-table")) {
        const wrap = document.createElement("div");
        wrap.className = "table-scroll";
        table.replaceWith(wrap);
        wrap.append(table);
      }
    });
    el.replaceChildren(surface);
    surface.__afterMount?.();
    mounted = true;
    document.title = `MirrorGap — ${view.charAt(0).toUpperCase() + view.slice(1)}`;
    $$(".tab").forEach((t) =>
      t.setAttribute("aria-current", t.classList.contains("active") ? "page" : "false"),
    );
    if (changed) window.scrollTo({ top: 0, behavior: "instant" });
  } catch (err) {
    if (version === routeVersion)
      el.innerHTML = `<div class="card"><p class="verify-bad">${esc(err.message ?? err)}</p></div>`;
  }
}

$$(".tab").forEach((t) => t.addEventListener("click", () => ctx.navigate(t.dataset.view)));
window.addEventListener("hashchange", route);
$(".skip-link").addEventListener("click", (e) => {
  e.preventDefault();
  $("#view").focus();
});

/* ---------------- search ---------------- */
let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 1) return $("#search-results").classList.add("hidden");
  searchTimer = setTimeout(async () => {
    try {
      const d = await api(`/api/v1/assets?q=${encodeURIComponent(q)}`);
      if ($("#search").value.trim() !== q) return;
      const box = $("#search-results");
      box.innerHTML =
        (d.assets ?? [])
          .map(
            (a) =>
              `<button type="button" class="sr-item" data-rwa="${a.rwaId}"><span class="sr-sym">${esc(a.symbol)}</span><span class="sr-name">${esc(a.name)}</span></button>`,
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
  const streamStatus = (connected) => {
    const dot = $("#live-dot");
    dot.classList.toggle("on", connected);
    dot.title = connected
      ? "SSE transport connected · not a market-data mode"
      : "SSE disconnected · retained data remains available";
    $("#stream-label").textContent = connected ? "Stream connected" : "Stream disconnected";
    dot.setAttribute("aria-label", dot.title);
  };
  es.onopen = () => streamStatus(true);
  es.onerror = () => streamStatus(false);
  const refreshViews = new Set(["overview", "radar", "events", "diagnostics"]);
  for (const type of ["snapshot", "event", "scan_finished"]) {
    es.addEventListener(type, () => {
      if (refreshViews.has(currentView) && !isInteracting()) route();
    });
  }
}

/* ---------------- boot ---------------- */
if (!location.hash) history.replaceState(null, "", "#/overview");
api("/api/v1/health")
  .then((d) => {
    ctx.setMode(d.dataMode);
    ctx.setCapability(d.capabilities);
  })
  .catch(() => {
    $("#mode-badge").textContent = "mode unknown";
  });
route();
connectStream();
setInterval(() => {
  if (["overview", "radar"].includes(currentView) && !isInteracting()) route();
}, 30_000);

// Preserve an active filter or keyboard interaction during background refreshes.
function isInteracting() {
  return (
    document.activeElement?.matches("input, select, textarea, button, a") ||
    Boolean($("#radar-filter")?.value) ||
    $("#radar-sort")?.value === "symbol"
  );
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("#search-results").classList.add("hidden");
    $("#search").blur();
  }
  if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.target.matches("input, textarea, select")) {
    e.preventDefault();
    $("#search").focus();
  }
});
