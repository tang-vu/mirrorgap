import { verifyReceipt } from "@mirrorgap/core";
import { c, fmtPct } from "../format.js";
import { argFlag, has, makeRuntime } from "./context.js";

/* ---------------- receipt ---------------- */
export async function receipt(args: string[]) {
  const id = args[1];
  if (!id) {
    console.error("receipt requires an event id (or a receipt JSON file with --file)");
    process.exit(1);
  }
  if (has(args, "verify")) {
    const file = argFlag(args, "file");
    if (file) {
      const { readFileSync } = await import("node:fs");
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const v = verifyReceipt(raw);
      console.log(v.ok ? c.green(`✓ verified ${raw.receiptId ?? ""}`) : c.red(`✗ ${v.errors.join("; ")}`));
      return;
    }
  }
  const inst = makeRuntime(args);
  const r = inst.runtime.store.receiptForEvent(id);
  if (!r) {
    console.error(`no receipt for ${id}`);
    return inst.close();
  }
  if (has(args, "verify")) {
    const v = verifyReceipt(r);
    console.log(`${r.receiptId}  ${v.ok ? c.green("✓ verified") : c.red("✗ " + v.errors.join("; "))}`);
    console.log(`  expected ${v.expectedHash}\n  actual   ${v.actualHash}`);
  } else if (has(args, "json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(c.bold(`\n${r.receiptId}`) + c.dim(` (${r.schema})`));
    console.log(`  event       ${r.eventId}`);
    console.log(`  generated   ${r.generatedAt}`);
    console.log(`  hash        ${r.receiptHash}`);
    console.log(`  signature   ${r.signature ? `${r.signature.alg}` : "unsigned"}`);
    console.log(`  verify      mirrorgap receipt ${r.eventId} --verify`);
  }
  inst.close();
}

/* ---------------- capsule ---------------- */
export async function capsule(args: string[]) {
  const id = args[1];
  if (!id) {
    console.error("capsule requires an event id");
    process.exit(1);
  }
  const inst = makeRuntime(args);
  const cap = inst.runtime.evidenceCapsule(id);
  if (!cap) {
    console.error(`no evidence capsule for ${id} (event unconfirmed or unknown)`);
    return inst.close();
  }
  const out = argFlag(args, "out");
  if (out) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, JSON.stringify(cap, null, 2));
    console.log(`capsule written → ${out}`);
    return inst.close();
  }
  if (has(args, "json")) {
    console.log(JSON.stringify(cap, null, 2));
    return inst.close();
  }
  console.log(c.bold(`\n⬡ MirrorGap Evidence Capsule`) + c.dim(` v${cap.capsuleVersion}`));
  console.log(`  incident       ${cap.eventId} — ${cap.asset.symbol} ${cap.lifecycle.kind}`);
  console.log(
    `  status         ${cap.lifecycle.status}   severity ${cap.lifecycle.severity}   class ${cap.lifecycle.classification}`,
  );
  console.log(`  data source    ${cap.dataMode === "live" ? "CoinMarketCap LIVE" : "FIXTURE (synthetic)"}`);
  console.log(
    `  peak deviation ${fmtPct(cap.observed.peakDeviationPct)}   confirmations ${cap.lifecycle.confirmations}   recurrences ${cap.lifecycle.recurrences}`,
  );
  console.log(`  first seen     ${cap.lifecycle.firstSeenAt}`);
  console.log(`  wrappers       ${cap.representations.map((r) => r.symbol).join(", ")}`);
  console.log(
    `  claims         ${
      Object.entries(cap.claimSummary)
        .map(([k, n]) => `${n} ${k}`)
        .join(" · ") || "none"
    }`,
  );
  const v = cap.integrity.verification;
  console.log(
    `  verification   ${v.ok ? c.green("VALID") : c.red("INVALID — " + v.errors.join("; "))}` +
      `  (hash ${v.hashOk ? "✓" : "✗"}${v.signatureOk === null ? ", unsigned" : `, signature ${v.signatureOk ? "✓" : "✗"}`})`,
  );
  console.log(`  receipt hash   ${cap.integrity.receiptHash}`);
  inst.close();
}
