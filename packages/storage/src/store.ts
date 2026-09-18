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

  openEventFor(rwaId: number, kind: string): AnomalyEvent | null;
  upsertEvent(e: AnomalyEvent): void;
  getEvent(eventId: string): AnomalyEvent | null;
  listEvents(opts?: { status?: string; limit?: number }): AnomalyEvent[];

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
