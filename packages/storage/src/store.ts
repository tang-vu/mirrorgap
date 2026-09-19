import type {
  AlertRecord,
  AnomalyEvent,
  EvidenceReceipt,
  EventTransition,
  IntegritySnapshot,
  Investigation,
  Issuer,
  Observation,
  RwaAsset,
  ScanRun,
  TokenRepresentation,
  WatchlistEntry,
} from "@mirrorgap/core";
import type { CmcDiagnostic } from "@mirrorgap/cmc";

/**
 * Storage contract for MirrorGap. SqliteStore is the production
 * implementation; the interface is deliberately small so a Postgres adapter
 * can be added without touching call sites.
 */
export interface MirrorGapStore {
  readonly kind: "sqlite" | "postgres";
  close(): void;

  upsertAsset(a: RwaAsset): void;
  getAsset(rwaId: number): RwaAsset | null;
  findAssetBySymbol(symbol: string): RwaAsset | null;
  listAssets(): RwaAsset[];
  searchAssets(q: string): RwaAsset[];

  upsertIssuer(i: Issuer): void;
  getIssuer(issuerId: string): Issuer | null;

  upsertRepresentation(r: TokenRepresentation): void;
  listRepresentations(rwaId: number): TokenRepresentation[];

  insertObservation(o: Observation): void;
  getObservations(ids: string[]): Observation[];
  latestObservations(rwaId: number): Observation[];

  insertSnapshot(s: IntegritySnapshot): void;
  getSnapshot(snapshotId: string): IntegritySnapshot | null;
  latestSnapshot(rwaId: number): IntegritySnapshot | null;
  listSnapshotsByScan(scanId: string): IntegritySnapshot[];
  /** Time-ascending snapshots for one asset, bounded. `since`/`until` are ISO instants. */
  snapshotsFor(rwaId: number, opts?: { since?: string; until?: string; limit?: number }): IntegritySnapshot[];

  openEventFor(rwaId: number, kind: string): AnomalyEvent | null;
  upsertEvent(e: AnomalyEvent): void;
  getEvent(eventId: string): AnomalyEvent | null;
  listEvents(opts?: { status?: string; limit?: number; rwaId?: number }): AnomalyEvent[];
  /** All event ids for one asset+kind, oldest first — recurrence tracking. */
  eventIdsFor(rwaId: number, kind: string): string[];
  eventCountsByStatus(): Record<string, number>;

  insertTransition(t: EventTransition): void;
  transitionsFor(eventId: string): EventTransition[];
  /** Transitions for an asset within a window — radar/incident context. */
  transitionsForAsset(rwaId: number, opts?: { since?: string; limit?: number }): EventTransition[];

  listWatchlist(): WatchlistEntry[];
  getWatchEntry(rwaId: number): WatchlistEntry | null;
  upsertWatchEntry(e: WatchlistEntry): void;
  removeWatchEntry(rwaId: number): boolean;

  /** Dedup check: has this exact alert already been sent? */
  alertSent(eventId: string, transition: string, severity: string): boolean;
  recordAlert(r: AlertRecord): void;
  listAlerts(limit?: number): AlertRecord[];

  /** Delete telemetry older than the given ISO cutoff. Never touches events/receipts. */
  pruneOlderThan(cutoffIso: string): { observations: number; snapshots: number; diagnostics: number };

  /** Aggregate counts for overview/diagnostics. */
  stats(): { assets: number; snapshots: number; events: number; transitions: number; dbBytes: number | null };

  insertInvestigation(i: Investigation): void;
  latestInvestigationFor(eventId: string): Investigation | null;

  insertReceipt(r: EvidenceReceipt): void;
  receiptForEvent(eventId: string): EvidenceReceipt | null;

  beginScan(scan: ScanRun): void;
  completeScan(
    scanId: string,
    result: {
      status: "completed" | "failed";
      assetsScanned: number;
      anomaliesFound: number;
      error?: string | null;
    },
  ): void;
  latestScan(): ScanRun | null;
  listScans(limit?: number): ScanRun[];

  recordDiagnostic(d: CmcDiagnostic): void;
  listDiagnostics(limit?: number): CmcDiagnostic[];

  nextEventSeq(datePrefix: string): number;
}
