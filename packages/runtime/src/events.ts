import { EventEmitter } from "node:events";
import type { IntegritySnapshot, AnomalyEvent, ScanRun } from "@mirrorgap/core";

export type RuntimeEvent =
  | { type: "scan_started"; scan: ScanRun }
  | { type: "snapshot"; snapshot: IntegritySnapshot; assetSymbol: string }
  | { type: "event"; event: AnomalyEvent; assetSymbol: string }
  | { type: "scan_finished"; scan: ScanRun };

/** Simple pub/sub so HTTP SSE, CLI watch, and MCP can share live signals. */
export class RuntimeBus extends EventEmitter {
  publish(e: RuntimeEvent): void {
    this.emit("signal", e);
    this.emit(e.type, e);
  }
}
