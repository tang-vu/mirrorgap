import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
import { MIGRATIONS } from "./schema.js";
import type { MirrorGapStore } from "./store.js";

/**
 * SQLite implementation of MirrorGapStore. WAL mode, synchronous driver —
 * boring, reliable, zero-server. Payloads are canonical JSON of the domain
 * objects so any row can be re-validated on read.
 */
export class SqliteStore implements MirrorGapStore {
  readonly kind = "sqlite" as const;
  private db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`,
    );
    const current = (
      this.db.prepare("SELECT COALESCE(MAX(version),0) AS v FROM schema_migrations").get() as { v: number }
    ).v;
    for (const m of MIGRATIONS) {
      if (m.version > current) {
        this.db.transaction(() => {
          this.db.exec(m.sql);
          this.db
            .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?,?,?)")
            .run(m.version, m.name, new Date().toISOString());
        })();
      }
    }
  }

  close(): void {
    this.db.close();
  }

  // ---- assets ----------------------------------------------------------------

  upsertAsset(a: RwaAsset): void {
    this.db
      .prepare(
        `INSERT INTO assets (rwa_id, payload, symbol, name, asset_type, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(rwa_id) DO UPDATE SET payload=excluded.payload, symbol=excluded.symbol, name=excluded.name, asset_type=excluded.asset_type, updated_at=excluded.updated_at`,
      )
      .run(a.rwaId, JSON.stringify(a), a.symbol, a.name, a.assetType, new Date().toISOString());
  }

  getAsset(rwaId: number): RwaAsset | null {
    const row = this.db.prepare("SELECT payload FROM assets WHERE rwa_id=?").get(rwaId) as
      { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as RwaAsset) : null;
  }

  findAssetBySymbol(symbol: string): RwaAsset | null {
    const row = this.db.prepare("SELECT payload FROM assets WHERE UPPER(symbol)=UPPER(?)").get(symbol) as
      { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as RwaAsset) : null;
  }

  listAssets(): RwaAsset[] {
    const rows = this.db.prepare("SELECT payload FROM assets ORDER BY symbol").all() as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as RwaAsset);
  }

  searchAssets(q: string): RwaAsset[] {
    const like = `%${q}%`;
    const rows = this.db
      .prepare(
        "SELECT payload FROM assets WHERE UPPER(symbol) LIKE UPPER(?) OR UPPER(name) LIKE UPPER(?) ORDER BY symbol LIMIT 20",
      )
      .all(like, like) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as RwaAsset);
  }

  // ---- issuers / representations ------------------------------------------------

  upsertIssuer(i: Issuer): void {
    this.db
      .prepare(
        `INSERT INTO issuers (issuer_id, payload, name, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(issuer_id) DO UPDATE SET payload=excluded.payload, name=excluded.name, updated_at=excluded.updated_at`,
      )
      .run(i.issuerId, JSON.stringify(i), i.name, new Date().toISOString());
  }

  getIssuer(issuerId: string): Issuer | null {
    const row = this.db.prepare("SELECT payload FROM issuers WHERE issuer_id=?").get(issuerId) as
      { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as Issuer) : null;
  }

  upsertRepresentation(r: TokenRepresentation): void {
    this.db
      .prepare(
        `INSERT INTO representations (crypto_id, rwa_id, payload, symbol, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(crypto_id) DO UPDATE SET payload=excluded.payload, rwa_id=excluded.rwa_id, symbol=excluded.symbol, updated_at=excluded.updated_at`,
      )
      .run(r.cryptoId, r.rwaId, JSON.stringify(r), r.symbol, new Date().toISOString());
  }

  listRepresentations(rwaId: number): TokenRepresentation[] {
    const rows = this.db.prepare("SELECT payload FROM representations WHERE rwa_id=?").all(rwaId) as {
      payload: string;
    }[];
    return rows.map((r) => JSON.parse(r.payload) as TokenRepresentation);
  }

  // ---- observations --------------------------------------------------------------

  insertObservation(o: Observation): void {
    this.db
      .prepare(
        `INSERT INTO observations (observation_id, rwa_id, kind, observed_at, retrieved_at, payload)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(observation_id) DO UPDATE SET payload=excluded.payload`,
      )
      .run(o.observationId, o.rwaId, o.kind, o.observedAt, o.provenance.retrievedAt, JSON.stringify(o));
  }

  getObservations(ids: string[]): Observation[] {
    if (ids.length === 0) return [];
    const marks = ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT payload FROM observations WHERE observation_id IN (${marks})`)
      .all(...ids) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as Observation);
  }

  latestObservations(rwaId: number): Observation[] {
    const rows = this.db
      .prepare("SELECT payload FROM observations WHERE rwa_id=? ORDER BY observed_at DESC LIMIT 50")
      .all(rwaId) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as Observation);
  }

  // ---- snapshots ------------------------------------------------------------------

  insertSnapshot(s: IntegritySnapshot): void {
    this.db
      .prepare(
        `INSERT INTO snapshots (snapshot_id, scan_id, rwa_id, measured_at, severity, classification, payload)
       VALUES (?,?,?,?,?,?,?)`,
      )
      .run(s.snapshotId, s.scanId, s.rwaId, s.measuredAt, s.severity, s.classification, JSON.stringify(s));
  }

  getSnapshot(snapshotId: string): IntegritySnapshot | null {
    const row = this.db.prepare("SELECT payload FROM snapshots WHERE snapshot_id=?").get(snapshotId) as
      { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as IntegritySnapshot) : null;
  }

  latestSnapshot(rwaId: number): IntegritySnapshot | null {
    const row = this.db
      .prepare("SELECT payload FROM snapshots WHERE rwa_id=? ORDER BY measured_at DESC LIMIT 1")
      .get(rwaId) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as IntegritySnapshot) : null;
  }

  listSnapshotsByScan(scanId: string): IntegritySnapshot[] {
    const rows = this.db.prepare("SELECT payload FROM snapshots WHERE scan_id=?").all(scanId) as {
      payload: string;
    }[];
    return rows.map((r) => JSON.parse(r.payload) as IntegritySnapshot);
  }

  snapshotsFor(
    rwaId: number,
    opts: { since?: string; until?: string; limit?: number } = {},
  ): IntegritySnapshot[] {
    const limit = Math.min(opts.limit ?? 5000, 20_000);
    const clauses = ["rwa_id=?"];
    const args: (string | number)[] = [rwaId];
    if (opts.since) {
      clauses.push("measured_at>=?");
      args.push(opts.since);
    }
    if (opts.until) {
      clauses.push("measured_at<=?");
      args.push(opts.until);
    }
    const rows = this.db
      .prepare(
        `SELECT payload FROM snapshots WHERE ${clauses.join(" AND ")} ORDER BY measured_at ASC LIMIT ?`,
      )
      .all(...args, limit) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as IntegritySnapshot);
  }

  // ---- events -----------------------------------------------------------------------

  openEventFor(rwaId: number, kind: string): AnomalyEvent | null {
    const row = this.db
      .prepare(
        `SELECT payload FROM events WHERE rwa_id=? AND kind=? AND status IN ('candidate','confirmed')
       ORDER BY last_seen_at DESC LIMIT 1`,
      )
      .get(rwaId, kind) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as AnomalyEvent) : null;
  }

  upsertEvent(e: AnomalyEvent): void {
    this.db
      .prepare(
        `INSERT INTO events (event_id, rwa_id, kind, status, severity, classification, first_seen_at, last_seen_at, resolved_at, payload)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(event_id) DO UPDATE SET status=excluded.status, severity=excluded.severity,
         classification=excluded.classification, last_seen_at=excluded.last_seen_at,
         resolved_at=excluded.resolved_at, payload=excluded.payload`,
      )
      .run(
        e.eventId,
        e.rwaId,
        e.kind,
        e.status,
        e.severity,
        e.classification,
        e.firstSeenAt,
        e.lastSeenAt,
        e.resolvedAt,
        JSON.stringify(e),
      );
  }

  getEvent(eventId: string): AnomalyEvent | null {
    const row = this.db.prepare("SELECT payload FROM events WHERE event_id=?").get(eventId) as
      { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as AnomalyEvent) : null;
  }

  listEvents(opts: { status?: string; limit?: number; rwaId?: number } = {}): AnomalyEvent[] {
    const limit = Math.min(opts.limit ?? 100, 1000);
    const clauses: string[] = [];
    const args: (string | number)[] = [];
    if (opts.status) {
      clauses.push("status=?");
      args.push(opts.status);
    }
    if (opts.rwaId !== undefined) {
      clauses.push("rwa_id=?");
      args.push(opts.rwaId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT payload FROM events ${where} ORDER BY last_seen_at DESC LIMIT ?`)
      .all(...args, limit) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as AnomalyEvent);
  }

  eventIdsFor(rwaId: number, kind: string): string[] {
    const rows = this.db
      .prepare("SELECT event_id FROM events WHERE rwa_id=? AND kind=? ORDER BY first_seen_at ASC")
      .all(rwaId, kind) as { event_id: string }[];
    return rows.map((r) => r.event_id);
  }

  eventCountsByStatus(): Record<string, number> {
    const rows = this.db.prepare("SELECT status, COUNT(*) AS n FROM events GROUP BY status").all() as {
      status: string;
      n: number;
    }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r.n;
    return out;
  }

  // ---- event transitions ------------------------------------------------------

  insertTransition(t: EventTransition): void {
    this.db
      .prepare(
        `INSERT INTO event_transitions (event_id, rwa_id, at, transition, severity, deviation_pct, snapshot_id, detail, frame)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        t.eventId,
        t.rwaId,
        t.at,
        t.transition,
        t.severity,
        t.deviationPct,
        t.snapshotId,
        t.detail,
        t.frame ? JSON.stringify(t.frame) : null,
      );
  }

  private rowToTransition(r: Record<string, unknown>): EventTransition {
    return {
      id: r["id"] as number,
      eventId: r["event_id"] as string,
      rwaId: r["rwa_id"] as number,
      at: r["at"] as string,
      transition: r["transition"] as EventTransition["transition"],
      severity: r["severity"] as EventTransition["severity"],
      deviationPct: (r["deviation_pct"] as number | null) ?? null,
      snapshotId: (r["snapshot_id"] as string | null) ?? null,
      detail: r["detail"] as string,
      ...(r["frame"] ? { frame: JSON.parse(r["frame"] as string) as EventTransition["frame"] } : {}),
    };
  }

  transitionsFor(eventId: string): EventTransition[] {
    const rows = this.db
      .prepare("SELECT * FROM event_transitions WHERE event_id=? ORDER BY id ASC")
      .all(eventId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToTransition(r));
  }

  transitionsForAsset(rwaId: number, opts: { since?: string; limit?: number } = {}): EventTransition[] {
    const limit = Math.min(opts.limit ?? 2000, 10_000);
    const rows = opts.since
      ? this.db
          .prepare("SELECT * FROM event_transitions WHERE rwa_id=? AND at>=? ORDER BY id ASC LIMIT ?")
          .all(rwaId, opts.since, limit)
      : this.db
          .prepare("SELECT * FROM event_transitions WHERE rwa_id=? ORDER BY id ASC LIMIT ?")
          .all(rwaId, limit);
    return (rows as Record<string, unknown>[]).map((r) => this.rowToTransition(r));
  }

  // ---- watchlist ----------------------------------------------------------------

  private rowToWatch(r: Record<string, unknown>): WatchlistEntry {
    return {
      rwaId: r["rwa_id"] as number,
      symbol: r["symbol"] as string,
      addedAt: r["added_at"] as string,
      thresholds: r["thresholds_json"] ? JSON.parse(r["thresholds_json"] as string) : null,
      enabled: (r["enabled"] as number) === 1,
    };
  }

  listWatchlist(): WatchlistEntry[] {
    const rows = this.db.prepare("SELECT * FROM watchlist ORDER BY symbol").all() as Record<
      string,
      unknown
    >[];
    return rows.map((r) => this.rowToWatch(r));
  }

  getWatchEntry(rwaId: number): WatchlistEntry | null {
    const row = this.db.prepare("SELECT * FROM watchlist WHERE rwa_id=?").get(rwaId) as
      Record<string, unknown> | undefined;
    return row ? this.rowToWatch(row) : null;
  }

  upsertWatchEntry(e: WatchlistEntry): void {
    this.db
      .prepare(
        `INSERT INTO watchlist (rwa_id, symbol, added_at, thresholds_json, enabled) VALUES (?,?,?,?,?)
         ON CONFLICT(rwa_id) DO UPDATE SET symbol=excluded.symbol, thresholds_json=excluded.thresholds_json, enabled=excluded.enabled`,
      )
      .run(
        e.rwaId,
        e.symbol,
        e.addedAt,
        e.thresholds ? JSON.stringify(e.thresholds) : null,
        e.enabled ? 1 : 0,
      );
  }

  removeWatchEntry(rwaId: number): boolean {
    return this.db.prepare("DELETE FROM watchlist WHERE rwa_id=?").run(rwaId).changes > 0;
  }

  // ---- alerts ---------------------------------------------------------------------

  alertSent(eventId: string, transition: string, severity: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM alert_log WHERE event_id=? AND transition=? AND severity=? AND status='sent' LIMIT 1",
      )
      .get(eventId, transition, severity);
    return row !== undefined;
  }

  recordAlert(r: AlertRecord): void {
    this.db
      .prepare(
        `INSERT INTO alert_log (event_id, transition, severity, destination, status, sent_at, detail)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(r.eventId, r.transition, r.severity, r.destination, r.status, r.sentAt, r.detail);
  }

  listAlerts(limit = 100): AlertRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM alert_log ORDER BY id DESC LIMIT ?")
      .all(Math.min(limit, 1000)) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r["id"] as number,
      eventId: r["event_id"] as string,
      transition: r["transition"] as string,
      severity: r["severity"] as string,
      destination: r["destination"] as string,
      status: r["status"] as AlertRecord["status"],
      sentAt: r["sent_at"] as string,
      detail: (r["detail"] as string | null) ?? null,
    }));
  }

  // ---- retention + stats -------------------------------------------------------------

  pruneOlderThan(cutoffIso: string): { observations: number; snapshots: number; diagnostics: number } {
    const tx = this.db.transaction(() => {
      const observations = this.db
        .prepare("DELETE FROM observations WHERE retrieved_at < ?")
        .run(cutoffIso).changes;
      // Keep snapshots referenced by events (latestSnapshotId) so incident
      // detail stays intact; prune the rest older than the cutoff.
      const snapshots = this.db
        .prepare(
          `DELETE FROM snapshots WHERE measured_at < ? AND snapshot_id NOT IN
             (SELECT json_extract(payload, '$.latestSnapshotId') FROM events)`,
        )
        .run(cutoffIso).changes;
      const diagnostics = this.db.prepare("DELETE FROM diagnostics WHERE at < ?").run(cutoffIso).changes;
      return { observations, snapshots, diagnostics };
    });
    return tx();
  }

  stats(): {
    assets: number;
    snapshots: number;
    events: number;
    transitions: number;
    dbBytes: number | null;
  } {
    const one = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    let dbBytes: number | null = null;
    try {
      const pageCount = (this.db.pragma("page_count", { simple: true }) as number) ?? 0;
      const pageSize = (this.db.pragma("page_size", { simple: true }) as number) ?? 0;
      dbBytes = pageCount * pageSize;
    } catch {
      dbBytes = null;
    }
    return {
      assets: one("SELECT COUNT(*) AS n FROM assets"),
      snapshots: one("SELECT COUNT(*) AS n FROM snapshots"),
      events: one("SELECT COUNT(*) AS n FROM events"),
      transitions: one("SELECT COUNT(*) AS n FROM event_transitions"),
      dbBytes,
    };
  }

  // ---- investigations / receipts ------------------------------------------------------

  insertInvestigation(i: Investigation): void {
    this.db
      .prepare(
        "INSERT INTO investigations (investigation_id, event_id, payload, created_at) VALUES (?,?,?,?)",
      )
      .run(i.investigationId, i.eventId, JSON.stringify(i), i.createdAt);
  }

  latestInvestigationFor(eventId: string): Investigation | null {
    const row = this.db
      .prepare("SELECT payload FROM investigations WHERE event_id=? ORDER BY created_at DESC LIMIT 1")
      .get(eventId) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as Investigation) : null;
  }

  insertReceipt(r: EvidenceReceipt): void {
    this.db
      .prepare(
        "INSERT INTO receipts (receipt_id, event_id, receipt_hash, payload, created_at) VALUES (?,?,?,?,?)",
      )
      .run(r.receiptId, r.eventId, r.receiptHash, JSON.stringify(r), r.generatedAt);
  }

  receiptForEvent(eventId: string): EvidenceReceipt | null {
    const row = this.db
      .prepare("SELECT payload FROM receipts WHERE event_id=? ORDER BY created_at DESC LIMIT 1")
      .get(eventId) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as EvidenceReceipt) : null;
  }

  // ---- scans ----------------------------------------------------------------------------

  beginScan(scan: ScanRun): void {
    this.db
      .prepare("INSERT INTO scan_runs (scan_id, started_at, status, data_mode) VALUES (?,?,?,?)")
      .run(scan.scanId, scan.startedAt, scan.status, scan.dataMode);
  }

  completeScan(
    scanId: string,
    result: {
      status: "completed" | "failed";
      assetsScanned: number;
      anomaliesFound: number;
      error?: string | null;
    },
  ): void {
    this.db
      .prepare(
        "UPDATE scan_runs SET completed_at=?, status=?, assets_scanned=?, anomalies_found=?, error=? WHERE scan_id=?",
      )
      .run(
        new Date().toISOString(),
        result.status,
        result.assetsScanned,
        result.anomaliesFound,
        result.error ?? null,
        scanId,
      );
  }

  latestScan(): ScanRun | null {
    const row = this.db.prepare("SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1").get() as
      Record<string, unknown> | undefined;
    return row ? this.rowToScan(row) : null;
  }

  listScans(limit = 20): ScanRun[] {
    const rows = this.db
      .prepare("SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToScan(r));
  }

  private rowToScan(row: Record<string, unknown>): ScanRun {
    return {
      scanId: row["scan_id"] as string,
      startedAt: row["started_at"] as string,
      completedAt: (row["completed_at"] as string | null) ?? null,
      dataMode: row["data_mode"] as "live" | "fixture",
      assetsScanned: row["assets_scanned"] as number,
      anomaliesFound: row["anomalies_found"] as number,
      status: row["status"] as ScanRun["status"],
      error: (row["error"] as string | null) ?? null,
    };
  }

  // ---- diagnostics -----------------------------------------------------------------------

  recordDiagnostic(d: CmcDiagnostic): void {
    this.db
      .prepare("INSERT INTO diagnostics (at, endpoint, outcome, payload) VALUES (?,?,?,?)")
      .run(d.at, d.endpoint, d.outcome, JSON.stringify(d));
  }

  listDiagnostics(limit = 200): CmcDiagnostic[] {
    const rows = this.db.prepare("SELECT payload FROM diagnostics ORDER BY id DESC LIMIT ?").all(limit) as {
      payload: string;
    }[];
    return rows.map((r) => JSON.parse(r.payload) as CmcDiagnostic);
  }

  // ---- ids ---------------------------------------------------------------------------------

  /** Monotonic event sequence per UTC date for ids like MG-20260918-0007. */
  nextEventSeq(datePrefix: string): number {
    const key = `event_seq:${datePrefix}`;
    const tx = this.db.transaction(() => {
      const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key) as
        { value: string } | undefined;
      const next = (row ? Number(row.value) : 0) + 1;
      this.db
        .prepare(
          "INSERT INTO meta (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, String(next));
      return next;
    });
    return tx();
  }
}
