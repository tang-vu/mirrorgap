import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { auditReceipt, computeReceiptHash, verifyReceipt } from "../packages/core/src/index.js";
import { createRuntime } from "../packages/runtime/src/factory.js";
import { seedHistory } from "../packages/runtime/src/seed.js";

const now = new Date("2026-09-18T15:00:00.000Z");
const inst = createRuntime({
  env: {
    MIRRORGAP_DATA_MODE: "fixture",
    MIRRORGAP_FIXTURE_SCENARIO: "incident_cycle",
    MIRRORGAP_CONFIRM_SCANS: "1",
  },
  dataMode: "fixture",
  dbPath: ":memory:",
});
const dir = new URL("../data/workbench-demo/", import.meta.url);
mkdirSync(dir, { recursive: true });
let count = 0;
const pass = (name: string) => {
  count++;
  console.log(`PASS ${name}`);
};
try {
  await seedHistory(inst.runtime, { ticks: 31, now });
  const review = inst.runtime.workbench(2, undefined, now)!;
  assert.equal(review.dataMode, "fixture");
  assert.ok(review.wrappers.length >= 2);
  pass("seeded CMC-shaped fixture produces a peer review");
  const quote = {
    rwaId: 2,
    price: 100,
    currency: "USD",
    unit: "share",
    observedAt: now.toISOString(),
    source: "Synthetic demo input",
    sourceUrl: "https://example.com/quote",
    dataMode: "fixture" as const,
    mappings: review.wrappers.map((w) => ({ cryptoId: w.cryptoId, underlyingUnitsPerToken: 1 })),
  };
  const comparison = inst.runtime.workbench(2, quote, now)!;
  assert.ok(comparison.underlying!.comparisons.every((c) => c.status === "indicative"));
  pass("explicit units produce indicative underlying comparisons in a pinned open session");
  const refused = inst.runtime.workbench(2, { ...quote, dataMode: "live" }, now)!;
  assert.ok(
    refused.underlying!.comparisons.every(
      (c) => c.gapPct === null && c.reasons.includes("data_mode_mismatch"),
    ),
  );
  pass("live quote cannot be mixed into fixture evidence");
  assert.equal(
    inst.runtime.workbench(2, undefined, new Date(now.getTime() + 3600000))!.disposition,
    "refresh_evidence",
  );
  pass("stale snapshot asks for refreshed evidence");
  const path = new URL("review.json", dir);
  writeFileSync(path, JSON.stringify(comparison, null, 2));
  const verify = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./verify-review.mjs", import.meta.url)), fileURLToPath(path)],
    { encoding: "utf8" },
  );
  assert.equal(verify.status, 0, verify.stderr);
  pass("exported review verifies with standalone Node script");
  const capsule = inst.runtime
    .listEvents({ limit: 100 })
    .map((e) => inst.runtime.evidenceCapsule(e.eventId))
    .find((c) => c && c.receipt.metrics.gaps.length)!;
  assert.ok(capsule);
  assert.equal(auditReceipt(capsule.receipt).ok, true);
  writeFileSync(new URL("capsule.json", dir), JSON.stringify(capsule, null, 2));
  pass("incident receipt passes arithmetic and evidence-link audit");
  const corrupt = structuredClone(capsule.receipt);
  corrupt.metrics.gaps[0]!.gapPct += 10;
  delete corrupt.signature;
  corrupt.receiptHash = computeReceiptHash(corrupt);
  assert.equal(verifyReceipt(corrupt).ok, true);
  assert.equal(auditReceipt(corrupt).ok, false);
  writeFileSync(new URL("rehashed-wrong-receipt.json", dir), JSON.stringify(corrupt, null, 2));
  pass("rehashing wrong arithmetic cannot fool semantic audit");
  console.log(
    `${count}/${count} checks passed. Synthetic artifacts: data/workbench-demo/. No live price or trade is claimed.`,
  );
} finally {
  inst.close();
}
