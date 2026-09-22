import type {
  AlertRecord,
  AnomalyEvent,
  EvidenceCapsule,
  EvidenceReceipt,
  EventTransition,
  HistoryPoint,
  HistoryStats,
  HistoryWindow,
  IncidentStats,
  IntegritySnapshot,
  Investigation,
  MirrorGapConfig,
  RwaAsset,
  ScanRun,
  Thresholds,
  TimelineEntry,
  WatchlistEntry,
} from "@mirrorgap/core";
import {
  applyScanToEvent,
  buildCapsule,
  buildIncidentTimeline,
  buildInvestigation,
  buildReceipt,
  buildWorkbench,
  type UnderlyingQuote,
  downsamplePoints,
  evaluateAsset,
  historyStats,
  incidentStats,
  signReceipt,
  snapshotToPoint,
  verifyReceipt,
  windowToMs,
  type VerifyResult,
} from "@mirrorgap/core";
import {
  toReferenceObservation,
  toRepresentations,
  toRwaAsset,
  toTokenObservations,
  toTradfiMarkets,
  type RwaDataSource,
  type RwaQuotesEntry,
} from "@mirrorgap/cmc";
import type { MirrorGapStore } from "@mirrorgap/storage";
import { RuntimeBus } from "./events.js";
import { explainDeterministic, explainWithOptionalLlm, type Explanation } from "./explain.js";
import { AlertDispatcher, type AlertTransition } from "./alerts.js";
import type { Provenance, Severity } from "@mirrorgap/core";

export interface RuntimeDeps {
  config: MirrorGapConfig;
  source: RwaDataSource;
  store: MirrorGapStore;
  bus?: RuntimeBus;
  signingKey?: string | undefined;
  alerts?: AlertDispatcher;
}

export interface ScanOutcome {
  scan: ScanRun;
  snapshots: IntegritySnapshot[];
  events: AnomalyEvent[];
}

export interface EventDetail {
  event: AnomalyEvent;
  asset: RwaAsset | null;
  snapshot: IntegritySnapshot | null;
  investigation: Investigation | null;
  receipt: EvidenceReceipt | null;
  verification: VerifyResult | null;
  timeline?: TimelineEntry[];
  stats?: IncidentStats;
  explanation?: Explanation;
}

const SEV_RANK: Record<string, number> = { none: 0, info: 1, watch: 2, high: 3, critical: 4 };

/**
 * The scan pipeline: CMC source → domain observations → deterministic engine
 * → persistence → event lifecycle (with transition records) → investigation
 * + receipt for confirmed anomalies → lifecycle-aware alerts.
 * One code path used by HTTP, CLI, MCP and the scheduler.
 */
export class MirrorGapRuntime {
  readonly bus: RuntimeBus;
  readonly alerts: AlertDispatcher;
  constructor(private deps: RuntimeDeps) {
    this.bus = deps.bus ?? new RuntimeBus();
    this.alerts =
      deps.alerts ??
      new AlertDispatcher(deps.store, deps.config.alerts, { publicUrl: deps.config.publicUrl });
  }

  get store() {
    return this.deps.store;
  }
  get source() {
    return this.deps.source;
  }

  capabilities(): Record<string, string> {
    return this.deps.source.capabilities();
  }
  private get config() {
    return this.deps.config;
  }

  /**
   * Resolve the watchlist. Priority:
   *   1. explicit symbols (ad-hoc scan)
   *   2. persisted watchlist (enabled entries)
   *   3. fallback: top-ranked map entries with tokens (bounded by watchLimit)
   */
  async resolveWatchlist(symbols?: string[]): Promise<RwaAsset[]> {
    if (symbols && symbols.length > 0) {
      const out: RwaAsset[] = [];
      for (const s of symbols) {
        const found = await this.source.listRwaMap({ symbol: [s.toUpperCase()] });
        for (const e of found.data ?? []) out.push(toRwaAsset(e));
      }
      return out;
    }
    const watched = this.store.listWatchlist().filter((w) => w.enabled);
    if (watched.length > 0) {
      const bySymbol = new Map(watched.map((w) => [w.symbol.toUpperCase(), w]));
      const found = await this.source.listRwaMap({ symbol: [...bySymbol.keys()] });
      const assets = (found.data ?? []).map(toRwaAsset);
      // Keep entries whose symbol resolved; unresolved entries stay in the
      // watchlist (they may resolve later) but are skipped this scan.
      return assets.slice(0, this.config.watchLimit);
    }
    const map = await this.source.listRwaMap({ limit: 250 });
    const entries = (map.data ?? []).filter((e) => e.has_tokens);
    const ranked = entries
      .slice()
      .sort((a, b) => (a.rwa_rank ?? 9999) - (b.rwa_rank ?? 9999))
      .slice(0, this.config.watchLimit);
    return ranked.map(toRwaAsset);
  }

  /** Watchlist management — returns the entry or throws on unknown asset. */
  async addToWatchlist(input: { symbol?: string; rwaId?: number; thresholds?: Thresholds | null }) {
    const existing = this.store.listWatchlist();
    if (input.rwaId === undefined && !input.symbol) {
      throw new Error("watchlist add requires a symbol or rwaId");
    }
    let asset: RwaAsset | null = null;
    if (input.rwaId !== undefined) {
      asset = this.store.getAsset(input.rwaId);
      if (!asset) {
        const found = await this.source.listRwaMap({ limit: 250 });
        const e = (found.data ?? []).find((x) => x.rwa_id === input.rwaId);
        if (e) asset = toRwaAsset(e);
      }
    } else {
      const found = await this.source.listRwaMap({ symbol: [input.symbol!.toUpperCase()] });
      const e = (found.data ?? [])[0];
      if (e) asset = toRwaAsset(e);
      if (!asset) asset = this.store.findAssetBySymbol(input.symbol!);
    }
    if (!asset) throw new Error(`unknown asset: ${input.symbol ?? input.rwaId}`);
    const already = existing.find((w) => w.rwaId === asset!.rwaId);
    if (!already && existing.length >= this.config.watchLimit) {
      throw new Error(`watchlist full (${this.config.watchLimit} max) — remove an asset first`);
    }
    const entry: WatchlistEntry = {
      rwaId: asset.rwaId,
      symbol: asset.symbol,
      addedAt: already?.addedAt ?? new Date().toISOString(),
      thresholds: input.thresholds ?? already?.thresholds ?? null,
      enabled: true,
    };
    this.store.upsertWatchEntry(entry);
    this.store.upsertAsset(asset);
    return entry;
  }

  removeFromWatchlist(rwaId: number): boolean {
    return this.store.removeWatchEntry(rwaId);
  }

  listWatchlist(): WatchlistEntry[] {
    return this.store.listWatchlist();
  }

  /** Run one scan across the watchlist (or a symbol subset). */
  async scan(opts: { symbols?: string[]; label?: string; now?: Date } = {}): Promise<ScanOutcome> {
    const scanId = `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const scanNow = opts.now ?? new Date();
    const scan: ScanRun = {
      scanId,
      startedAt: scanNow.toISOString(),
      completedAt: null,
      dataMode: this.source.mode,
      assetsScanned: 0,
      anomaliesFound: 0,
      status: "running",
      error: null,
    };
    this.store.beginScan(scan);
    this.bus.publish({ type: "scan_started", scan });

    const snapshots: IntegritySnapshot[] = [];
    const events: AnomalyEvent[] = [];
    const alertJobs: Promise<void>[] = [];
    try {
      const watchlist = await this.resolveWatchlist(opts.symbols);
      const ids = watchlist.map((a) => a.rwaId);
      // Scripted fixtures advance one tick per scan and pin their clock to
      // the scan's `now` — live sources do not implement advance().
      this.source.advance?.(scanNow);
      const quotesResult = await this.source.getRwaQuotes({ rwaId: ids }, "USD");
      const entries = quotesResult.data ?? [];

      // Enrich with info (primary exchange) — one batched call, cached.
      const infoMap = new Map<number, RwaAsset>();
      try {
        const info = await this.source.getRwaInfo({ rwaId: ids });
        for (const e of info.data ?? []) infoMap.set(e.rwa_id, toRwaAsset(e));
      } catch {
        // info is enrichment only — proceed without exchanges
      }

      const marketPairsAvailable =
        this.source.capabilities().marketPairs === "yes"
          ? true
          : this.source.capabilities().marketPairs === "no"
            ? false
            : null;

      const thresholdOverrides = new Map<number, Thresholds>();
      for (const w of this.store.listWatchlist()) {
        if (w.thresholds) thresholdOverrides.set(w.rwaId, w.thresholds);
      }

      for (const entry of entries) {
        const outcome = this.processEntry(
          entry,
          infoMap.get(entry.rwa_id),
          scanId,
          marketPairsAvailable,
          scanNow,
          quotesResult.provenance,
          thresholdOverrides.get(entry.rwa_id),
          alertJobs,
        );
        if (!outcome) continue;
        snapshots.push(outcome.snapshot);
        this.bus.publish({
          type: "snapshot",
          snapshot: outcome.snapshot,
          assetSymbol: outcome.asset.symbol,
        });
        if (outcome.event) {
          events.push(outcome.event);
          this.bus.publish({ type: "event", event: outcome.event, assetSymbol: outcome.asset.symbol });
        }
      }

      // Retention: prune telemetry older than the configured window.
      if (this.config.retentionDays > 0) {
        try {
          const cutoff = new Date(scanNow.getTime() - this.config.retentionDays * 86_400_000);
          this.store.pruneOlderThan(cutoff.toISOString());
        } catch {
          // retention is housekeeping — never break a scan over it
        }
      }

      const done = {
        ...scan,
        completedAt: new Date().toISOString(),
        assetsScanned: snapshots.length,
        anomaliesFound: events.filter((e) => e.status === "confirmed").length,
        status: "completed" as const,
      };
      this.store.completeScan(scanId, {
        status: "completed",
        assetsScanned: done.assetsScanned,
        anomaliesFound: done.anomaliesFound,
      });
      this.bus.publish({ type: "scan_finished", scan: done });

      // Alerts are best-effort — awaited so callers (tests, CLI) see settled
      // delivery, but every failure is already swallowed inside notify().
      await Promise.allSettled(alertJobs);

      return { scan: done, snapshots, events };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.store.completeScan(scanId, {
        status: "failed",
        assetsScanned: snapshots.length,
        anomaliesFound: events.length,
        error: message,
      });
      const failed = {
        ...scan,
        status: "failed" as const,
        error: message,
        completedAt: new Date().toISOString(),
      };
      this.bus.publish({ type: "scan_finished", scan: failed });
      await Promise.allSettled(alertJobs);
      throw err;
    }
  }

  /** Normalize one quotes entry → evaluate → persist → lifecycle → receipt → alert. */
  private processEntry(
    entry: RwaQuotesEntry,
    infoAsset: RwaAsset | undefined,
    scanId: string,
    marketPairsAvailable: boolean | null,
    now: Date,
    provenance: Provenance,
    thresholdOverride: Thresholds | undefined,
    alertJobs: Promise<void>[],
  ): { asset: RwaAsset; snapshot: IntegritySnapshot; event: AnomalyEvent | null } | null {
    const asset: RwaAsset = { ...toRwaAsset(entry), primaryExchange: infoAsset?.primaryExchange ?? null };
    const reps = toRepresentations(entry);
    const reference = toReferenceObservation(entry, provenance, "USD");
    const { observations: tokens } = toTokenObservations(entry, provenance, "USD");
    const tradfi = toTradfiMarkets(entry);

    this.store.upsertAsset(asset);
    for (const r of reps) this.store.upsertRepresentation(r);
    if (reference) this.store.insertObservation(reference);
    for (const t of tokens) this.store.insertObservation(t);

    const existing =
      this.store.openEventFor(asset.rwaId, "parity_gap") ??
      this.store.openEventFor(asset.rwaId, "cross_wrapper_dispersion");
    const prevSeverity: Severity | null = existing?.severity ?? null;
    const snapshotId = `snap:${scanId}:${asset.rwaId}`;

    const { snapshot, anomaly } = evaluateAsset({
      scanId,
      snapshotId,
      asset,
      reference,
      tokens,
      thresholds: thresholdOverride ?? this.config.thresholds,
      freshness: { freshSeconds: this.config.freshSeconds, agingSeconds: this.config.agingSeconds },
      marketPairsAvailable,
      priorConfirmations: existing?.confirmations ?? 0,
      now,
    });
    this.store.insertSnapshot(snapshot);

    const lifecycle = applyScanToEvent(existing, snapshot, anomaly, {
      confirmScans: this.config.confirmScans,
      now,
      eventIdFactory: () => {
        const prefix = now.toISOString().slice(0, 10).replaceAll("-", "");
        return `MG-${prefix}-${String(this.store.nextEventSeq(prefix)).padStart(4, "0")}`;
      },
      assetSymbol: asset.symbol,
      dataMode: this.source.mode,
    });
    if (!lifecycle) return { asset, snapshot, event: null };

    const event = lifecycle.event;
    this.store.upsertEvent(event);
    this.recordTransition(event, lifecycle.transition, anomaly?.deviationPct ?? null, snapshot, now, {
      prevSeverity,
      confirmations: event.confirmations,
      kind: event.kind,
    });

    // Lifecycle-aware alerts (deduplicated inside the dispatcher).
    const alertTransition: AlertTransition | null =
      lifecycle.transition === "created"
        ? "created"
        : lifecycle.transition === "confirmed"
          ? "confirmed"
          : lifecycle.transition === "resolved"
            ? "resolved"
            : lifecycle.transition === "invalidated"
              ? "invalidated"
              : lifecycle.transition === "updated" &&
                  prevSeverity !== null &&
                  (SEV_RANK[event.severity] ?? 0) > (SEV_RANK[prevSeverity] ?? 0)
                ? "severity_escalated"
                : null;
    if (alertTransition) {
      alertJobs.push(this.alerts.notify(alertTransition, event, snapshot));
    }

    // Confirmed anomalies earn a full investigation + signed-capable receipt.
    if (lifecycle.transition === "confirmed") {
      const investigation = buildInvestigation({
        investigationId: `inv:${event.eventId}:${event.confirmations}`,
        event,
        snapshot,
        asset,
        reference,
        tokens,
        representations: reps,
        tradfiMarkets: tradfi,
        marketPairsAvailable,
        now,
      });
      this.store.insertInvestigation(investigation);
      const receipt = buildReceipt({
        receiptId: `MGR-${event.eventId}`,
        event,
        snapshot,
        investigation,
        asset,
        representations: reps,
        observations: [...(reference ? [reference] : []), ...tokens],
        tradfiMarkets: tradfi,
        now,
      });
      const signed = this.deps.signingKey
        ? { ...receipt, signature: signReceipt(receipt, this.deps.signingKey) }
        : receipt;
      this.store.insertReceipt(signed);
    }
    return { asset, snapshot, event };
  }

  /** Persist one transition row — the raw material of incident timelines. */
  private recordTransition(
    event: AnomalyEvent,
    transition: "created" | "confirmed" | "resolved" | "invalidated" | "updated" | "none",
    deviationPct: number | null,
    snapshot: IntegritySnapshot,
    now: Date,
    ctx: { prevSeverity: Severity | null; confirmations: number; kind: string },
  ): void {
    if (transition === "none") return;
    const kind = ctx.kind === "parity_gap" ? "parity gap vs tokenized aggregate" : "cross-wrapper dispersion";
    const detail =
      transition === "created"
        ? `${event.assetSymbol}: ${kind} first measured at ${deviationPct?.toFixed(2)}% (${event.severity}) — candidate opened.`
        : transition === "confirmed"
          ? `${event.assetSymbol}: anomaly confirmed after ${ctx.confirmations} confirmation(s) at ${deviationPct?.toFixed(2)}% — severity ${event.severity}, classification ${event.classification}.`
          : transition === "resolved"
            ? `${event.assetSymbol}: deviation returned inside configured thresholds — incident resolved.`
            : transition === "invalidated"
              ? `${event.assetSymbol}: reference became ${snapshot.reference.state} — comparison no longer possible, incident invalidated.`
              : `${event.assetSymbol}: deviation now ${deviationPct?.toFixed(2)}% (${event.severity}).`;
    const maxAbsGap = snapshot.gaps.reduce((m, g) => Math.max(m, Math.abs(g.gapPct)), 0);
    const t: EventTransition = {
      eventId: event.eventId,
      rwaId: event.rwaId,
      at: now.toISOString(),
      transition,
      severity: event.severity,
      deviationPct,
      snapshotId: snapshot.snapshotId,
      detail,
      frame: {
        referenceState: snapshot.reference.state,
        underlyingMarket: snapshot.reference.underlyingMarket,
        aggregateFreshness: snapshot.reference.aggregateFreshness.state,
        dispersionPct: snapshot.dispersion.dispersionPct,
        maxAbsGapPct: snapshot.gaps.length ? maxAbsGap : null,
        dataQuality: snapshot.dataQuality.score,
        gaps: snapshot.gaps.map((g) => ({ tokenSymbol: g.tokenSymbol, gapPct: g.gapPct })),
      },
    };
    this.store.insertTransition(t);
  }

  /** Radar summary: latest snapshot per watched asset. */
  workbench(rwaId: number, underlying?: UnderlyingQuote, now = new Date()) {
    const asset = this.store.getAsset(rwaId);
    const snapshot = this.store.latestSnapshot(rwaId);
    if (!asset || !snapshot) return null;
    return buildWorkbench({
      asset,
      snapshot,
      observations: this.store.getObservations(snapshot.observationIds),
      representations: this.store.listRepresentations(rwaId),
      dataMode: this.source.mode,
      now,
      maxAgeSeconds: this.config.agingSeconds,
      ...(underlying ? { underlying } : {}),
    });
  }

  radar(): { asset: RwaAsset; snapshot: IntegritySnapshot }[] {
    return this.store
      .listAssets()
      .map((asset) => ({ asset, snapshot: this.store.latestSnapshot(asset.rwaId) }))
      .filter((x): x is { asset: RwaAsset; snapshot: IntegritySnapshot } => x.snapshot !== null)
      .sort((a, b) => Math.abs(maxGap(b.snapshot)) - Math.abs(maxGap(a.snapshot)));
  }

  /** History series for one asset. Bounded + deterministically downsampled. */
  assetHistory(
    rwaId: number,
    opts: { window?: HistoryWindow; maxPoints?: number } = {},
  ): { window: HistoryWindow; points: HistoryPoint[]; stats: HistoryStats } {
    const window = opts.window ?? "24h";
    const ms = windowToMs(window);
    const since = ms === null ? undefined : new Date(Date.now() - ms).toISOString();
    const snaps = this.store.snapshotsFor(rwaId, {
      ...(since ? { since } : {}),
      limit: 20_000,
    });
    const points = snaps.map(snapshotToPoint);
    const stats = historyStats(points);
    return { window, points: downsamplePoints(points, opts.maxPoints ?? 720), stats };
  }

  /** Incident timeline: event + transitions → narrative entries. */
  eventTimeline(eventId: string): { event: AnomalyEvent; entries: TimelineEntry[] } | null {
    const event = this.store.getEvent(eventId);
    if (!event) return null;
    const transitions = this.store.transitionsFor(eventId);
    const receipt = this.store.receiptForEvent(eventId);
    const entries = buildIncidentTimeline(event, transitions, {
      receiptIssuedAt: receipt?.generatedAt ?? null,
    });
    return { event, entries };
  }

  /** All transitions for one event (raw records). */
  eventTransitions(eventId: string): EventTransition[] {
    return this.store.transitionsFor(eventId);
  }

  /** Public Evidence Capsule: receipt + human context + verification. */
  evidenceCapsule(eventId: string): EvidenceCapsule | null {
    const event = this.store.getEvent(eventId);
    if (!event) return null;
    const receipt = this.store.receiptForEvent(eventId);
    if (!receipt) return null;
    const verification = verifyReceipt(receipt);
    const siblings = this.store.eventIdsFor(event.rwaId, event.kind);
    const stats = incidentStats(event, this.store.transitionsFor(eventId), siblings);
    return buildCapsule({ event, receipt, verification, stats });
  }

  /** Observatory overview stats for the first screen. */
  overview(): {
    dataMode: "live" | "fixture";
    assetsWatched: number;
    assetsAnomalous: number;
    activeIncidents: number;
    confirmedIncidents: number;
    criticalOrHigh: number;
    watchlistSize: number;
    latestScan: ScanRun | null;
    eventCounts: Record<string, number>;
    storage: { snapshots: number; transitions: number; dbBytes: number | null };
    capabilities: Record<string, string>;
    alertsConfigured: boolean;
    signingConfigured: boolean;
  } {
    const counts = this.store.eventCountsByStatus();
    const events = this.store.listEvents({ limit: 1000 });
    const active = events.filter((e) => e.status === "candidate" || e.status === "confirmed");
    const radar = this.radar();
    return {
      dataMode: this.config.dataMode,
      assetsWatched: radar.length,
      assetsAnomalous: radar.filter((r) => r.snapshot.severity !== "none").length,
      activeIncidents: active.length,
      confirmedIncidents: active.filter((e) => e.status === "confirmed").length,
      criticalOrHigh: active.filter((e) => (SEV_RANK[e.severity] ?? 0) >= (SEV_RANK["high"] ?? 3)).length,
      watchlistSize: this.store.listWatchlist().filter((w) => w.enabled).length,
      latestScan: this.store.latestScan(),
      eventCounts: counts,
      storage: this.store.stats(),
      capabilities: this.capabilities(),
      alertsConfigured: this.alerts.configured,
      signingConfigured: Boolean(this.deps.signingKey),
    };
  }

  listAlertLog(limit = 50): AlertRecord[] {
    return this.store.listAlerts(limit);
  }

  getEventDetail(eventId: string): EventDetail | null {
    const event = this.store.getEvent(eventId);
    if (!event) return null;
    const snapshot = this.store.getSnapshot(event.latestSnapshotId);
    const investigation = this.store.latestInvestigationFor(eventId);
    const receipt = this.store.receiptForEvent(eventId);
    const tl = this.eventTimeline(eventId);
    const siblings = this.store.eventIdsFor(event.rwaId, event.kind);
    return {
      event,
      asset: this.store.getAsset(event.rwaId),
      snapshot,
      investigation,
      receipt,
      verification: receipt ? verifyReceipt(receipt) : null,
      timeline: tl?.entries ?? [],
      stats: incidentStats(event, this.store.transitionsFor(eventId), siblings),
    };
  }

  /** Deterministic narration; optional LLM polish when configured. */
  async explainEvent(eventId: string, opts: { llm?: boolean } = {}): Promise<Explanation | null> {
    const d = this.getEventDetail(eventId);
    if (!d) return null;
    const base = explainDeterministic({
      event: d.event,
      snapshot: d.snapshot,
      investigation: d.investigation,
      asset: d.asset,
    });
    if (!opts.llm) return base;
    return explainWithOptionalLlm(base, this.deps.config.llm);
  }

  listEvents(opts: { status?: string; limit?: number; rwaId?: number } = {}): AnomalyEvent[] {
    return this.store.listEvents(opts);
  }

  verifyEventReceipt(eventId: string): VerifyResult | null {
    const receipt = this.store.receiptForEvent(eventId);
    return receipt ? verifyReceipt(receipt) : null;
  }
}

function maxGap(s: IntegritySnapshot): number {
  return s.gaps.reduce((m, g) => Math.max(m, Math.abs(g.gapPct)), 0);
}
