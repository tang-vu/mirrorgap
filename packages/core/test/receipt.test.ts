import { describe, expect, it } from "vitest";
import {
  buildReceipt,
  verifyReceipt,
  computeReceiptHash,
  generateSigningKey,
  signReceipt,
  verifyReceiptSignature,
} from "../src/receipt.js";
import { buildInvestigation } from "../src/investigation.js";
import { evaluateAsset } from "../src/engine.js";
import { canonicalJson, roundForHash } from "../src/canonical.js";
import type { AnomalyEvent } from "../src/domain/results.js";
import { NOW, asset, refObs, tokObs } from "./helpers.js";

const T = { info: 0.25, watch: 0.5, high: 1.0, critical: 2.0 };

function fixture() {
  const a = asset();
  const ref = refObs(226.46);
  const tokens = [tokObs(36992, "NVDAX", 226.33), tokObs(38093, "NVDAon", 230.4)];
  const { snapshot, anomaly } = evaluateAsset({
    scanId: "scan_1",
    snapshotId: "snap_1",
    asset: a,
    reference: ref,
    tokens,
    thresholds: T,
    freshness: { freshSeconds: 120, agingSeconds: 600 },
    marketPairsAvailable: null,
    priorConfirmations: 1,
    now: NOW,
  });
  const event: AnomalyEvent = {
    eventId: "evt_1",
    rwaId: 2,
    assetSymbol: "NVDA",
    kind: "parity_gap",
    classification: "parity_gap",
    severity: "high",
    status: "confirmed",
    firstSeenAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    confirmations: 2,
    maxDeviationPct: 1.741,
    latestDeviationPct: 1.741,
    latestSnapshotId: "snap_1",
    resolvedAt: null,
    dataMode: "fixture",
  };
  const inv = buildInvestigation({
    investigationId: "inv_1",
    event,
    snapshot,
    asset: a,
    reference: ref,
    tokens,
    representations: [
      {
        cryptoId: 36992,
        symbol: "NVDAX",
        name: "NVIDIA xStock",
        rwaId: 2,
        issuerId: "6878977dcbbf471de3366e85",
        issuerName: "Backed Assets",
      },
      {
        cryptoId: 38093,
        symbol: "NVDAon",
        name: "NVIDIA Ondo",
        rwaId: 2,
        issuerId: "688ca4ccabae9b5b9fb3167a",
        issuerName: "Ondo Assets",
      },
    ],
    tradfiMarkets: [
      {
        exchangeSlug: "binance",
        exchangeName: "Binance",
        exchangeId: 270,
        ticker: "NVDA",
        marketUrl: "https://www.binance.com/en/stocks/EQ_NVDA",
      },
    ],
    marketPairsAvailable: null,
    now: NOW,
  });
  const receipt = buildReceipt({
    receiptId: "rcpt_1",
    event,
    snapshot,
    investigation: inv,
    asset: a,
    representations: [],
    observations: [ref, ...tokens],
    tradfiMarkets: [],
    now: NOW,
  });
  return { receipt, inv, anomaly };
}

describe("evidence receipts", () => {
  it("produces a schema-valid receipt with a sha256 hash", () => {
    const { receipt } = fixture();
    expect(receipt.schema).toBe("mirrorgap.receipt.v1");
    expect(receipt.receiptHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(verifyReceipt(receipt).ok).toBe(true);
  });

  it("hash is deterministic — same inputs, same hash", () => {
    const a = fixture().receipt;
    const b = fixture().receipt;
    expect(a.receiptHash).toBe(b.receiptHash);
    expect(canonicalJson(JSON.parse(JSON.stringify({ a: 1, b: [2, 3] })))).toBe('{"a":1,"b":[2,3]}');
  });

  it("detects tampering", () => {
    const { receipt } = fixture();
    const tampered = JSON.parse(JSON.stringify(receipt)) as typeof receipt;
    tampered.event.latestDeviationPct = 99.9;
    const v = verifyReceipt(tampered);
    expect(v.ok).toBe(false);
    expect(v.hashOk).toBe(false);
  });

  it("rejects structurally invalid receipts", () => {
    expect(verifyReceipt({ hello: "world" }).schemaOk).toBe(false);
    expect(verifyReceipt(null).ok).toBe(false);
  });

  it("hash excludes the hash field itself and any signature", () => {
    const { receipt } = fixture();
    const withSig = JSON.parse(JSON.stringify(receipt)) as Record<string, unknown>;
    withSig["signature"] = { alg: "ed25519", publicKey: "x", signature: "y" };
    expect(computeReceiptHash(withSig as typeof receipt)).toBe(receipt.receiptHash);
  });

  it("claims reference real evidence ids", () => {
    const { inv } = fixture();
    const kinds = new Set(inv.claims.map((c) => c.kind));
    expect(kinds.has("observed")).toBe(true);
    expect(kinds.has("derived")).toBe(true);
    expect(kinds.has("unknown")).toBe(true);
    for (const c of inv.claims) {
      if (c.kind === "derived") expect(c.formulaId).toBeTruthy();
    }
    // no claim may assert causality
    for (const c of inv.claims) {
      expect(c.statement).not.toMatch(/was caused by/i);
    }
  });

  it("supports optional ed25519 signing", () => {
    const { receipt } = fixture();
    const keys = generateSigningKey();
    const sig = signReceipt(receipt, keys.privateKey);
    expect(sig.alg).toBe("ed25519");
    expect(verifyReceiptSignature(receipt, sig)).toBe(true);
    // A signature binds to the receipt hash: a tampered-then-rehashed receipt
    // fails signature verification, and a wrong key fails too.
    const other = fixture().receipt;
    other.event.latestDeviationPct = 5;
    other.receiptHash = computeReceiptHash(other);
    expect(verifyReceiptSignature(other, sig)).toBe(false);
    const keys2 = generateSigningKey();
    expect(verifyReceiptSignature(receipt, signReceipt(receipt, keys2.privateKey))).toBe(true);
    expect(
      verifyReceiptSignature(receipt, {
        ...sig,
        signature: signReceipt(receipt, keys2.privateKey).signature,
      }),
    ).toBe(false);
  });

  it("roundForHash produces stable values", () => {
    expect(roundForHash(1.741234567)).toBe(1.741235);
    expect(roundForHash(-0.0)).toBe(0);
  });
});
