/**
 * SQLite schema for MirrorGap. Domain objects persist as canonical JSON in
 * `payload` columns; indexed columns exist for query patterns. This keeps the
 * schema small, honest, and easy to port to Postgres later (Store interface).
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "init",
    sql: `
      CREATE TABLE IF NOT EXISTS assets (
        rwa_id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS issuers (
        issuer_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        name TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS representations (
        crypto_id INTEGER PRIMARY KEY,
        rwa_id INTEGER NOT NULL,
        payload TEXT NOT NULL,
        symbol TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reps_rwa ON representations(rwa_id);
      CREATE TABLE IF NOT EXISTS observations (
        observation_id TEXT PRIMARY KEY,
        rwa_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        retrieved_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_obs_rwa ON observations(rwa_id, observed_at);
      CREATE TABLE IF NOT EXISTS snapshots (
        snapshot_id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        rwa_id INTEGER NOT NULL,
        measured_at TEXT NOT NULL,
        severity TEXT NOT NULL,
        classification TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snap_scan ON snapshots(scan_id);
      CREATE INDEX IF NOT EXISTS idx_snap_rwa ON snapshots(rwa_id, measured_at);
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        rwa_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        severity TEXT NOT NULL,
        classification TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        resolved_at TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
      CREATE INDEX IF NOT EXISTS idx_events_rwa ON events(rwa_id);
      CREATE TABLE IF NOT EXISTS investigations (
        investigation_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inv_event ON investigations(event_id);
      CREATE TABLE IF NOT EXISTS receipts (
        receipt_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        receipt_hash TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rcpt_event ON receipts(event_id);
      CREATE TABLE IF NOT EXISTS scan_runs (
        scan_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        data_mode TEXT NOT NULL,
        assets_scanned INTEGER NOT NULL DEFAULT 0,
        anomalies_found INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );
      CREATE TABLE IF NOT EXISTS diagnostics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        outcome TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "history_watchlist_alerts",
    sql: `
      -- Every lifecycle change + confirming observation for an anomaly event.
      -- This is the raw material of the incident timeline/replay.
      CREATE TABLE IF NOT EXISTS event_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        rwa_id INTEGER NOT NULL,
        at TEXT NOT NULL,
        transition TEXT NOT NULL,
        severity TEXT NOT NULL,
        deviation_pct REAL,
        snapshot_id TEXT,
        detail TEXT NOT NULL,
        frame TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_trans_event ON event_transitions(event_id, id);
      CREATE INDEX IF NOT EXISTS idx_trans_rwa ON event_transitions(rwa_id, at);

      -- Persisted watchlist: watched assets + optional per-asset thresholds.
      CREATE TABLE IF NOT EXISTS watchlist (
        rwa_id INTEGER PRIMARY KEY,
        symbol TEXT NOT NULL,
        added_at TEXT NOT NULL,
        thresholds_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      );

      -- Alert delivery log: dedup (event_id+transition+severity) + audit trail.
      CREATE TABLE IF NOT EXISTS alert_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        transition TEXT NOT NULL,
        severity TEXT NOT NULL,
        destination TEXT NOT NULL,
        status TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        detail TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_alert_dedup ON alert_log(event_id, transition, severity);
      CREATE INDEX IF NOT EXISTS idx_alert_at ON alert_log(sent_at);

      -- History hot paths.
      CREATE INDEX IF NOT EXISTS idx_snap_rwa_time ON snapshots(rwa_id, measured_at);
      CREATE INDEX IF NOT EXISTS idx_diag_at ON diagnostics(at);
    `,
  },
];
