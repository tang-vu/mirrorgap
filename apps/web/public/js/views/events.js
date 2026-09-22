/* Incident list — filterable anomaly events. */
import { $, $$, api, ago, errorCard, esc, sevClass } from "../util.js";

const STATUSES = ["", "candidate", "confirmed", "resolved", "invalidated"];

let retainedStatus = "";
export async function mount(el, ctx) {
  let status = retainedStatus;
  const render = async () => {
    try {
      const d = await api(`/api/v1/events${status ? `?status=${status}` : ""}`);
      el.innerHTML = `
        <div class="card">
          <div class="card-head">
            <h2>Incidents</h2>
            <div class="muted">${
              Object.entries(d.counts ?? {})
                .map(([k, n]) => `${n} ${k}`)
                .join(" · ") || ""
            }</div>
            <select id="event-filter" aria-label="filter by status">
              ${STATUSES.map((s) => `<option value="${s}" ${s === status ? "selected" : ""}>${s || "all"}</option>`).join("")}
            </select>
          </div>
          <div class="table-scroll"><table class="table" id="event-table">
            <thead><tr>
              <th>Incident</th><th>Asset</th><th>Kind</th><th>Class</th><th>Severity</th><th>Status</th><th>Dev</th><th>Peak</th><th>Conf</th><th>Last seen</th>
            </tr></thead>
            <tbody>
              ${
                (d.events ?? [])
                  .map(
                    (e) => `<tr>
                <td class="mono"><a href="#/event/${encodeURIComponent(e.eventId)}">${esc(e.eventId)}</a></td>
                <td><strong>${esc(e.assetSymbol)}</strong></td>
                <td>${esc(e.kind)}</td>
                <td><span class="muted">${esc(e.classification)}</span></td>
                <td><span class="${sevClass(e.severity)}">${e.severity}</span></td>
                <td><span class="state st-${e.status}">${e.status}</span></td>
                <td class="num">${e.latestDeviationPct.toFixed(2)}%</td>
                <td class="num">${e.maxDeviationPct.toFixed(2)}%</td>
                <td class="num">${e.confirmations}</td>
                <td class="muted">${ago(e.lastSeenAt)}</td>
              </tr>`,
                  )
                  .join("") || `<tr><td colspan="10" class="muted">no incidents match</td></tr>`
              }
            </tbody>
          </table></div>
        </div>`;
      $("#event-filter", el).addEventListener("change", (ev) => {
        status = retainedStatus = ev.target.value;
        render();
      });
    } catch (e) {
      el.innerHTML = errorCard(e, true);
      $("[data-retry]", el)?.addEventListener("click", render);
    }
  };
  await render();
}
