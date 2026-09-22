import { EvidenceReceiptSchema, verifyReceipt } from "./receipt.js";

/** Recompute numerical claims as well as the hash. This is not an oracle attestation. */
export function auditReceipt(raw: unknown) {
  const integrity = verifyReceipt(raw);
  const parsed = EvidenceReceiptSchema.safeParse(raw);
  const checks: { id: string; ok: boolean; detail: string }[] = [];
  const check = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
  if (parsed.success) {
    const r = parsed.data;
    const refs = r.observations.filter((o) => o.kind === "tokenized_aggregate");
    const tokens = r.observations.filter((o) => o.kind === "token");
    const ids = new Set(r.observations.map((o) => o.observationId));
    check(
      "observed_prices",
      tokens.length > 0 && tokens.every((o) => o.price !== null && o.price > 0),
      "At least one positive wrapper price is required.",
    );
    const comparable = refs.length === 1 ? tokens.filter((o) => o.currency === refs[0]!.currency) : [];
    check(
      "gap:coverage",
      refs.length <= 1 &&
        r.metrics.gaps.length === comparable.length &&
        new Set(r.metrics.gaps.map((g) => g.cryptoId)).size === r.metrics.gaps.length,
      "Every comparable wrapper has one gap, with no duplicate wrapper IDs.",
    );
    check("unique_observations", ids.size === r.observations.length, "Observation IDs must be unique.");
    check(
      "data_mode",
      r.provenance.length > 0 && r.provenance.every((p) => p.dataMode === r.dataMode),
      "Every provenance entry must match the receipt data mode.",
    );
    for (const c of r.claims) {
      check(
        `claim:${c.claimId}`,
        [...c.evidenceIds, ...(c.inputs ?? [])].every((id) => ids.has(id)),
        "Claim evidence links resolve inside this receipt.",
      );
    }
    for (const [i, g] of r.metrics.gaps.entries()) {
      const ref = refs.find((o) => o.currency === g.currency && o.price === g.referencePrice);
      // v1 receipts did not store cryptoId on observations. New receipts do;
      // legacy receipts can only be checked for matching price/currency.
      const token = tokens.find(
        (o) =>
          o.currency === g.currency &&
          o.price === g.tokenPrice &&
          (o.detail?.["cryptoId"] === undefined || o.detail["cryptoId"] === g.cryptoId),
      );
      check(
        `gap:${i}:inputs`,
        Boolean(ref && token),
        "Gap inputs must correspond to observations in the receipt.",
      );
      check(
        `gap:${i}:arithmetic`,
        g.referencePrice > 0 &&
          g.tokenPrice > 0 &&
          near(g.gapPct, ((g.tokenPrice - g.referencePrice) / g.referencePrice) * 100),
        "Recomputed wrapper/aggregate percentage (tolerance 0.000002 percentage points).",
      );
    }
    const currency = refs[0]?.currency ?? tokens[0]?.currency;
    const prices = tokens
      .filter((o) => o.currency === currency && o.price !== null && o.price > 0)
      .map((o) => o.price!)
      .sort((a, b) => a - b);
    const d = r.metrics.dispersion;
    check(
      "dispersion:count",
      d.wrapperCount === prices.length,
      "Wrapper count is recomputed from observations.",
    );
    const mid = Math.floor(prices.length / 2);
    const median = prices.length
      ? prices.length % 2
        ? prices[mid]!
        : (prices[mid - 1]! + prices[mid]!) / 2
      : null;
    check(
      "dispersion:range",
      equal(d.minPrice, prices[0] ?? null) &&
        equal(d.maxPrice, prices.at(-1) ?? null) &&
        equal(d.medianPrice, median),
      "Minimum, maximum and median are recomputed.",
    );
    const spread =
      prices.length < 2 || median === null ? null : ((prices.at(-1)! - prices[0]!) / median) * 100;
    check(
      "dispersion:arithmetic",
      equal(d.dispersionPct, spread),
      "Dispersion is recomputed independently of the claimed metric.",
    );
    check(
      "trace:coverage",
      r.calculationTrace.length === r.metrics.gaps.length,
      "Every gap has one calculation trace.",
    );
    for (const [i, trace] of r.calculationTrace.entries()) {
      const p = trace.inputs["token_price"];
      const ref = trace.inputs["reference_price"];
      check(
        `trace:${i}`,
        trace.formulaId === "parity_gap_v1" &&
          p !== undefined &&
          ref !== undefined &&
          ref > 0 &&
          near(trace.output, ((p - ref) / ref) * 100) &&
          r.metrics.gaps.some(
            (g) => g.tokenPrice === p && g.referencePrice === ref && near(g.gapPct, trace.output),
          ),
        "Trace formula, inputs and output agree with a measured gap.",
      );
    }
  }
  const arithmeticOk = parsed.success && checks.length > 0 && checks.every((c) => c.ok);
  return {
    schema: "mirrorgap.audit.v1",
    dataMode: parsed.success ? parsed.data.dataMode : null,
    ok: integrity.ok && arithmeticOk,
    integrity,
    arithmeticOk,
    checks,
    limitations: [
      "This checks internal consistency, not whether CMC actually issued these observations.",
      "An embedded signing key is not a trusted identity unless obtained through a separate trusted channel.",
      "Legacy v1 observations without cryptoId support price/currency matching only.",
      "Natural-language claims, economic backing and real-world causality are not authenticated.",
    ],
  };
}

function near(a: number, b: number) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.000002;
}
function equal(a: number | null, b: number | null) {
  return a === null || b === null ? a === b : near(a, b);
}
