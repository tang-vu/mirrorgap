import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AnomalyEvent,
  EvidenceReceipt,
  IntegritySnapshot,
  Investigation,
  Issuer,
  Observation,
  RwaAsset,
  ScanRun,
  TokenRepresentation,
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

  listEvents(opts: { status?: string; limit?: number } = {}): AnomalyEvent[] {
    const limit = opts.limit ?? 100;
    const rows = opts.status
      ? this.db
          .prepare("SELECT payload FROM events WHERE status=? ORDER BY last_seen_at DESC LIMIT ?")
          .all(opts.status, limit)
      : this.db.prepare("SELECT payload FROM events ORDER BY last_seen_at DESC LIMIT ?").all(limit);
    return (rows as { payload: string }[]).map((r) => JSON.parse(r.payload) as AnomalyEvent);
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
