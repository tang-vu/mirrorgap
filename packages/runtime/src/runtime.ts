import type {
  AnomalyEvent,
  EvidenceReceipt,
  IntegritySnapshot,
  Investigation,
  MirrorGapConfig,
  RwaAsset,
  ScanRun,
} from "@mirrorgap/core";
import {
  applyScanToEvent,
  buildInvestigation,
  buildReceipt,
  evaluateAsset,
  verifyReceipt,
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
import { signReceipt } from "@mirrorgap/core";
import { RuntimeBus } from "./events.js";
import { explainDeterministic, explainWithOptionalLlm, type Explanation } from "./explain.js";
import type { Provenance } from "@mirrorgap/core";

export interface RuntimeDeps {
  config: MirrorGapConfig;
  source: RwaDataSource;
  store: MirrorGapStore;
  bus?: RuntimeBus;
  signingKey?: string | undefined;
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
  explanation?: Explanation;
}

/**
 * The scan pipeline: CMC source → domain observations → deterministic engine
 * → persistence → event lifecycle → investigation + receipt for confirmed
 * anomalies. One code path used by HTTP, CLI, MCP and the scheduler.
 */
export class MirrorGapRuntime {
  readonly bus: RuntimeBus;
  constructor(private deps: RuntimeDeps) {
    this.bus = deps.bus ?? new RuntimeBus();
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

  /** Resolve the watchlist: explicit symbols, else top ranked map entries with tokens. */
  async resolveWatchlist(symbols?: string[]): Promise<RwaAsset[]> {
    if (symbols && symbols.length > 0) {
      const out: RwaAsset[] = [];
      for (const s of symbols) {
        const found = await this.source.listRwaMap({ symbol: [s.toUpperCase()] });
        for (const e of found.data ?? []) out.push(toRwaAsset(e));
      }
      return out;
    }
    const map = await this.source.listRwaMap({ limit: 250 });
    const entries = (map.data ?? []).filter((e) => e.has_tokens);
    const ranked = entries
      .slice()
      .sort((a, b) => (a.rwa_rank ?? 9999) - (b.rwa_rank ?? 9999))
      .slice(0, this.config.watchLimit);
    return ranked.map(toRwaAsset);
  }

  /** Run one scan across the watchlist (or a symbol subset). */
  async scan(opts: { symbols?: string[]; label?: string } = {}): Promise<ScanOutcome> {
    const scanId = `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const scan: ScanRun = {
      scanId,
      startedAt: new Date().toISOString(),
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
    try {
      const watchlist = await this.resolveWatchlist(opts.symbols);
      const ids = watchlist.map((a) => a.rwaId);
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

      const now = new Date();
      for (const entry of entries) {
        const outcome = this.processEntry(
          entry,
          infoMap.get(entry.rwa_id),
          scanId,
          marketPairsAvailable,
          now,
          quotesResult.provenance,
        );
        if (!outcome) continue;
        snapshots.push(outcome.snapshot);
        this.bus.publish({ type: "snapshot", snapshot: outcome.snapshot, assetSymbol: outcome.asset.symbol });
        if (outcome.event) {
          events.push(outcome.event);
          this.bus.publish({ type: "event", event: outcome.event, assetSymbol: outcome.asset.symbol });
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
      throw err;
    }
  }

  /** Normalize one quotes entry → evaluate → persist → lifecycle → receipt. */
  private processEntry(
    entry: RwaQuotesEntry,
    infoAsset: RwaAsset | undefined,
    scanId: string,
    marketPairsAvailable: boolean | null,
    now: Date,
    provenance: Provenance,
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
    const snapshotId = `snap:${scanId}:${asset.rwaId}`;

    const { snapshot, anomaly } = evaluateAsset({
      scanId,
      snapshotId,
      asset,
      reference,
      tokens,
      thresholds: this.config.thresholds,
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
        ? { ...receipt, signature: signWithKey(receipt, this.deps.signingKey) }
        : receipt;
      this.store.insertReceipt(signed);
    }
    return { asset, snapshot, event };
  }

  /** Radar summary: latest snapshot per watched asset. */
  radar(): { asset: RwaAsset; snapshot: IntegritySnapshot }[] {
    return this.store
      .listAssets()
      .map((asset) => ({ asset, snapshot: this.store.latestSnapshot(asset.rwaId) }))
      .filter((x): x is { asset: RwaAsset; snapshot: IntegritySnapshot } => x.snapshot !== null)
      .sort((a, b) => Math.abs(maxGap(b.snapshot)) - Math.abs(maxGap(a.snapshot)));
  }

  getEventDetail(eventId: string): EventDetail | null {
    const event = this.store.getEvent(eventId);
    if (!event) return null;
    const snapshot = this.store.getSnapshot(event.latestSnapshotId);
    const investigation = this.store.latestInvestigationFor(eventId);
    const receipt = this.store.receiptForEvent(eventId);
    return {
      event,
      asset: this.store.getAsset(event.rwaId),
      snapshot,
      investigation,
      receipt,
      verification: receipt ? verifyReceipt(receipt) : null,
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

  listEvents(opts: { status?: string; limit?: number } = {}): AnomalyEvent[] {
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

function signWithKey(receipt: EvidenceReceipt, privateKey: string) {
  return signReceipt(receipt, privateKey);
}
