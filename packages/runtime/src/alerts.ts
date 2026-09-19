import type { AnomalyEvent, IntegritySnapshot, MirrorGapConfig, Severity } from "@mirrorgap/core";
import type { MirrorGapStore } from "@mirrorgap/storage";

/**
 * Lifecycle-aware alerting. Delivers one deduplicated notification per
 * (event, transition, severity) to every configured destination:
 *
 *   - generic webhook  POST {json payload}           MIRRORGAP_ALERT_WEBHOOK_URL
 *   - discord webhook  POST {content, embeds}        MIRRORGAP_DISCORD_WEBHOOK_URL
 *   - telegram         POST api.telegram.org/sendMessage  token+chat id envs
 *
 * Semantics:
 *   - alerts fire on created/confirmed/severity_escalated/resolved/invalidated
 *   - a severity floor (MIRRORGAP_ALERT_MIN_SEVERITY, default "high") keeps
 *     noise down; resolutions are still reported for events that once crossed it
 *   - delivery is best-effort: one retry, short timeout, every outcome logged
 *     to alert_log; failures can never break the scan pipeline
 */
export type AlertTransition = "created" | "confirmed" | "severity_escalated" | "resolved" | "invalidated";

const SEV_RANK: Record<string, number> = { none: 0, info: 1, watch: 2, high: 3, critical: 4 };

export interface AlertDestination {
  kind: "webhook" | "discord" | "telegram";
  /** Display label stored in alert_log — never contains secrets. */
  label: string;
  url: string;
}

export interface AlertPayload {
  source: "mirrorgap";
  version: 1;
  transition: AlertTransition;
  dataMode: "live" | "fixture";
  event: {
    eventId: string;
    asset: string;
    rwaId: number;
    kind: string;
    classification: string;
    severity: string;
    status: string;
    deviationPct: number;
    peakDeviationPct: number;
    confirmations: number;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  context: {
    referenceState: string | null;
    underlyingMarket: string | null;
    aggregateFreshness: string | null;
    dispersionPct: number | null;
    dataQuality: number | null;
  };
  links: { incident: string | null; evidenceCapsule: string | null };
  emittedAt: string;
}

export class AlertDispatcher {
  private readonly destinations: AlertDestination[];
  private readonly minSeverity: number;
  private readonly publicUrl: string | null;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs = 8_000;
  private readonly maxAttempts = 2;

  constructor(
    private readonly store: MirrorGapStore,
    cfg: MirrorGapConfig["alerts"],
    opts: { publicUrl?: string | null; fetchFn?: typeof fetch } = {},
  ) {
    this.publicUrl = opts.publicUrl ?? null;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.minSeverity = SEV_RANK[cfg.minSeverity] ?? SEV_RANK["high"]!;
    this.destinations = [];
    if (cfg.webhookUrl) this.destinations.push({ kind: "webhook", label: "webhook", url: cfg.webhookUrl });
    if (cfg.discordWebhookUrl)
      this.destinations.push({ kind: "discord", label: "discord", url: cfg.discordWebhookUrl });
    if (cfg.telegramBotToken && cfg.telegramChatId) {
      this.destinations.push({
        kind: "telegram",
        label: "telegram",
        url: `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`,
      });
    }
    this.telegramChatId = cfg.telegramChatId;
  }

  private readonly telegramChatId: string | null;

  get configured(): boolean {
    return this.destinations.length > 0;
  }

  /** Destination labels for status surfaces — never includes URLs/secrets. */
  get destinationLabels(): string[] {
    return this.destinations.map((d) => d.label);
  }

  /**
   * Severity floor: the event's last-known severity must reach the
   * configured minimum. Below-floor events never alert — not even on
   * resolution — which keeps the noise profile predictable.
   */
  private shouldAlert(severity: Severity): boolean {
    return (SEV_RANK[severity] ?? 0) >= this.minSeverity;
  }

  /**
   * Send (deduplicated) alerts for one lifecycle transition. Never throws.
   */
  async notify(
    transition: AlertTransition,
    event: AnomalyEvent,
    snapshot: IntegritySnapshot | null,
  ): Promise<void> {
    if (this.destinations.length === 0) return;
    if (!this.shouldAlert(event.severity)) return;
    if (this.store.alertSent(event.eventId, transition, event.severity)) return;

    const payload = this.buildPayload(transition, event, snapshot);
    for (const dest of this.destinations) {
      const sent = await this.deliver(dest, payload);
      this.store.recordAlert({
        eventId: event.eventId,
        transition,
        severity: event.severity,
        destination: dest.label,
        status: sent.ok ? "sent" : "failed",
        sentAt: new Date().toISOString(),
        detail: sent.detail,
      });
    }
  }

  private buildPayload(
    transition: AlertTransition,
    event: AnomalyEvent,
    snapshot: IntegritySnapshot | null,
  ): AlertPayload {
    const base = this.publicUrl;
    return {
      source: "mirrorgap",
      version: 1,
      transition,
      dataMode: event.dataMode,
      event: {
        eventId: event.eventId,
        asset: event.assetSymbol,
        rwaId: event.rwaId,
        kind: event.kind,
        classification: event.classification,
        severity: event.severity,
        status: event.status,
        deviationPct: event.latestDeviationPct,
        peakDeviationPct: event.maxDeviationPct,
        confirmations: event.confirmations,
        firstSeenAt: event.firstSeenAt,
        lastSeenAt: event.lastSeenAt,
      },
      context: {
        referenceState: snapshot?.reference.state ?? null,
        underlyingMarket: snapshot?.reference.underlyingMarket ?? null,
        aggregateFreshness: snapshot?.reference.aggregateFreshness.state ?? null,
        dispersionPct: snapshot?.dispersion.dispersionPct ?? null,
        dataQuality: snapshot?.dataQuality.score ?? null,
      },
      links: {
        incident: base ? `${base}/#event/${event.eventId}` : null,
        evidenceCapsule: base ? `${base}/api/v1/capsules/${event.eventId}` : null,
      },
      emittedAt: new Date().toISOString(),
    };
  }

  private async deliver(
    dest: AlertDestination,
    payload: AlertPayload,
  ): Promise<{ ok: boolean; detail: string | null }> {
    const body = this.bodyFor(dest, payload);
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
        const res = await this.fetchFn(dest.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (res.ok) return { ok: true, detail: `HTTP ${res.status}` };
        if (res.status < 500 && res.status !== 429) {
          return { ok: false, detail: `HTTP ${res.status} (no retry)` };
        }
        if (attempt === this.maxAttempts) return { ok: false, detail: `HTTP ${res.status}` };
      } catch (err) {
        if (attempt === this.maxAttempts) {
          return { ok: false, detail: err instanceof Error ? err.message : String(err) };
        }
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    return { ok: false, detail: "unreachable" };
  }

  private bodyFor(dest: AlertDestination, p: AlertPayload): unknown {
    const summary =
      `[MirrorGap] ${p.event.asset} ${p.event.kind} ${p.transition} — ` +
      `${p.event.severity} @ ${p.event.deviationPct.toFixed(2)}% ` +
      `(${p.event.classification}, ${p.dataMode})`;
    if (dest.kind === "discord") {
      return {
        content: summary,
        embeds: [
          {
            title: `${p.event.asset} — ${p.event.kind}`,
            description:
              `**Transition:** ${p.transition}\n**Severity:** ${p.event.severity}\n` +
              `**Deviation:** ${p.event.deviationPct.toFixed(2)}%\n**Status:** ${p.event.status}\n` +
              `**Reference:** ${p.context.referenceState ?? "?"} · market ${p.context.underlyingMarket ?? "?"}\n` +
              `**Freshness:** ${p.context.aggregateFreshness ?? "?"}\n` +
              (p.links.incident ? `[incident](${p.links.incident}) · ` : "") +
              (p.links.evidenceCapsule ? `[evidence capsule](${p.links.evidenceCapsule})` : ""),
            color:
              p.event.severity === "critical" ? 0xf5564e : p.event.severity === "high" ? 0xf5853f : 0xf5c453,
          },
        ],
      };
    }
    if (dest.kind === "telegram") {
      return {
        chat_id: this.telegramChatId,
        text:
          `${summary}\n` +
          `reference: ${p.context.referenceState ?? "?"} · market: ${p.context.underlyingMarket ?? "?"}\n` +
          (p.links.evidenceCapsule ? `evidence: ${p.links.evidenceCapsule}` : ""),
        disable_web_page_preview: true,
      };
    }
    return p;
  }
}
