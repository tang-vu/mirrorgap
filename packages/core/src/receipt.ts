import {
  createHash,
  sign as edSign,
  verify as edVerify,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import { z } from "zod";
import { canonicalJson, roundForHash } from "./canonical.js";
import type { AnomalyEvent, IntegritySnapshot, Investigation } from "./domain/results.js";
import type { RwaAsset, TokenRepresentation, TradfiMarketContext } from "./domain/entities.js";
import type { Observation, Provenance } from "./domain/observations.js";

export const RECEIPT_SCHEMA_ID = "mirrorgap.receipt.v1" as const;

/** Zod schema for a v1 evidence receipt (validation at boundaries). */
export const EvidenceReceiptSchema = z.object({
  schema: z.literal(RECEIPT_SCHEMA_ID),
  receiptId: z.string(),
  eventId: z.string(),
  generatedAt: z.string().datetime(),
  dataMode: z.enum(["live", "fixture"]),
  asset: z.object({
    rwaId: z.number().int().positive(),
    symbol: z.string(),
    name: z.string(),
    assetType: z.string(),
    primaryExchange: z.string().nullable(),
  }),
  event: z.object({
    kind: z.string(),
    classification: z.string(),
    severity: z.string(),
    status: z.string(),
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
    confirmations: z.number().int(),
    maxDeviationPct: z.number(),
    latestDeviationPct: z.number(),
  }),
  representations: z.array(
    z.object({
      cryptoId: z.number().int().positive(),
      symbol: z.string(),
      name: z.string(),
      issuerId: z.string().nullable(),
      issuerName: z.string().nullable(),
    }),
  ),
  observations: z.array(
    z.object({
      observationId: z.string(),
      kind: z.string(),
      role: z.string(),
      currency: z.string(),
      price: z.number().nullable(),
      observedAt: z.string().datetime(),
      timestampSource: z.string(),
      detail: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  metrics: z.object({
    gaps: z.array(
      z.object({
        cryptoId: z.number(),
        tokenSymbol: z.string(),
        tokenPrice: z.number(),
        referencePrice: z.number(),
        currency: z.string(),
        gapPct: z.number(),
      }),
    ),
    dispersion: z.object({
      wrapperCount: z.number(),
      minPrice: z.number().nullable(),
      maxPrice: z.number().nullable(),
      medianPrice: z.number().nullable(),
      dispersionPct: z.number().nullable(),
    }),
    dataQuality: z.object({
      score: z.number(),
      factors: z.array(
        z.object({ name: z.string(), score: z.number(), weight: z.number(), detail: z.string() }),
      ),
    }),
  }),
  freshness: z.object({
    referenceState: z.string(),
    aggregateState: z.string(),
    aggregateAgeSeconds: z.number().nullable(),
    underlyingMarket: z.string(),
    marketHoursHeuristic: z.string().nullable(),
  }),
  claims: z.array(
    z.object({
      claimId: z.string(),
      kind: z.string(),
      statement: z.string(),
      evidenceIds: z.array(z.string()),
      formulaId: z.string().optional(),
      inputs: z.array(z.string()).optional(),
    }),
  ),
  limitations: z.array(z.string()),
  provenance: z.array(
    z.object({
      endpoint: z.string(),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      retrievedAt: z.string().datetime(),
      requestId: z.string(),
      dataMode: z.string(),
    }),
  ),
  calculationTrace: z.array(
    z.object({
      formulaId: z.string(),
      description: z.string(),
      inputs: z.record(z.string(), z.number()),
      output: z.number(),
    }),
  ),
  receiptHash: z.string(),
  signature: z
    .object({
      alg: z.literal("ed25519"),
      publicKey: z.string(),
      signature: z.string(),
    })
    .optional(),
});
export type EvidenceReceipt = z.infer<typeof EvidenceReceiptSchema>;

/** Deep-sort + normalize a receipt body for hashing (numbers pre-rounded). */
function receiptBody(receipt: EvidenceReceipt): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(receipt)) as Record<string, unknown>;
  delete clone["receiptHash"];
  delete clone["signature"];
  return clone;
}

export function computeReceiptHash(receipt: EvidenceReceipt): string {
  const body = receiptBody(receipt);
  const canonical = canonicalJson(body);
  return "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface BuildReceiptInput {
  receiptId: string;
  event: AnomalyEvent;
  snapshot: IntegritySnapshot;
  investigation: Investigation;
  asset: RwaAsset;
  representations: TokenRepresentation[];
  observations: Observation[];
  tradfiMarkets: TradfiMarketContext[];
  now: Date;
}

/**
 * Assemble a v1 evidence receipt from engine data. Numbers are rounded to a
 * fixed precision BEFORE hashing so recomputation is bit-stable.
 */
export function buildReceipt(input: BuildReceiptInput): EvidenceReceipt {
  const { event, snapshot, investigation, asset } = input;

  const provenanceSeen = new Map<string, Provenance>();
  for (const o of input.observations) {
    provenanceSeen.set(o.provenance.requestId + o.provenance.endpoint, o.provenance);
  }

  const receipt: EvidenceReceipt = {
    schema: RECEIPT_SCHEMA_ID,
    receiptId: input.receiptId,
    eventId: event.eventId,
    generatedAt: input.now.toISOString(),
    dataMode: event.dataMode,
    asset: {
      rwaId: asset.rwaId,
      symbol: asset.symbol,
      name: asset.name,
      assetType: asset.assetType,
      primaryExchange: asset.primaryExchange ?? null,
    },
    event: {
      kind: event.kind,
      classification: event.classification,
      severity: event.severity,
      status: event.status,
      firstSeenAt: event.firstSeenAt,
      lastSeenAt: event.lastSeenAt,
      confirmations: event.confirmations,
      maxDeviationPct: roundForHash(event.maxDeviationPct),
      latestDeviationPct: roundForHash(event.latestDeviationPct),
    },
    representations: input.representations.map((r) => ({
      cryptoId: r.cryptoId,
      symbol: r.symbol,
      name: r.name,
      issuerId: r.issuerId,
      issuerName: r.issuerName,
    })),
    observations: [
      ...input.observations.map((o) => ({
        observationId: o.observationId,
        kind: o.kind,
        role:
          o.kind === "tokenized_aggregate" ? "reference" : o.kind === "token" ? "representation" : "market",
        currency: o.currency,
        price: "price" in o ? o.price : null,
        observedAt: o.observedAt,
        timestampSource: o.timestampSource,
        detail:
          o.kind === "market_pair"
            ? { exchange: o.exchangeName, pair: o.pairSymbol }
            : o.kind === "token"
              ? { cryptoId: o.cryptoId, tokenSymbol: o.tokenSymbol }
              : undefined,
      })),
      ...input.tradfiMarkets.map((m) => ({
        observationId: `tradfi:${m.exchangeSlug}:${m.ticker}`,
        kind: "tradfi_context",
        role: "venue_context",
        currency: "N/A",
        price: null,
        observedAt: input.now.toISOString(),
        timestampSource: "retrieval",
        detail: { exchange: m.exchangeName, ticker: m.ticker },
      })),
    ],
    metrics: {
      gaps: snapshot.gaps.map((g) => ({
        cryptoId: g.cryptoId,
        tokenSymbol: g.tokenSymbol,
        tokenPrice: g.tokenPrice,
        referencePrice: g.referencePrice,
        currency: g.currency,
        gapPct: roundForHash(g.gapPct),
      })),
      dispersion: {
        wrapperCount: snapshot.dispersion.wrapperCount,
        minPrice: snapshot.dispersion.minPrice,
        maxPrice: snapshot.dispersion.maxPrice,
        medianPrice: snapshot.dispersion.medianPrice,
        dispersionPct:
          snapshot.dispersion.dispersionPct === null ? null : roundForHash(snapshot.dispersion.dispersionPct),
      },
      dataQuality: {
        score: snapshot.dataQuality.score,
        factors: snapshot.dataQuality.factors,
      },
    },
    freshness: {
      referenceState: snapshot.reference.state,
      aggregateState: snapshot.reference.aggregateFreshness.state,
      aggregateAgeSeconds: snapshot.reference.aggregateFreshness.ageSeconds,
      underlyingMarket: snapshot.reference.underlyingMarket,
      marketHoursHeuristic: snapshot.reference.marketHoursHeuristic,
    },
    claims: investigation.claims.map((c) => ({
      claimId: c.claimId,
      kind: c.kind,
      statement: c.statement,
      evidenceIds: c.evidenceIds,
      ...(c.formulaId ? { formulaId: c.formulaId } : {}),
      ...(c.inputs ? { inputs: c.inputs } : {}),
    })),
    limitations: investigation.limitations,
    provenance: [...provenanceSeen.values()].map((p) => ({
      endpoint: p.endpoint,
      params: p.params,
      retrievedAt: p.retrievedAt,
      requestId: p.requestId,
      dataMode: p.dataMode,
    })),
    calculationTrace: snapshot.gaps.map((g) => ({
      formulaId: "parity_gap_v1",
      description: "gap_pct = (token_price - reference_price) / reference_price * 100",
      inputs: { token_price: g.tokenPrice, reference_price: g.referencePrice },
      output: roundForHash(g.gapPct),
    })),
    receiptHash: "",
  };
  receipt.receiptHash = computeReceiptHash(receipt);
  return receipt;
}

/** Verification result — never throws on malformed input. */
export interface VerifyResult {
  ok: boolean;
  schemaOk: boolean;
  hashOk: boolean;
  signatureOk?: boolean | null;
  expectedHash: string | null;
  actualHash: string | null;
  errors: string[];
}

export function verifyReceipt(raw: unknown): VerifyResult {
  const errors: string[] = [];
  const parsed = EvidenceReceiptSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      schemaOk: false,
      hashOk: false,
      expectedHash: null,
      actualHash: null,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const receipt = parsed.data;
  const expected = computeReceiptHash(receipt);
  const hashOk = expected === receipt.receiptHash;
  if (!hashOk) errors.push("receipt hash mismatch — content was modified after issuance");
  let signatureOk: boolean | null = null;
  if (receipt.signature) {
    try {
      signatureOk = hashOk && verifyReceiptSignature(receipt, receipt.signature);
    } catch {
      signatureOk = false;
    }
    if (!signatureOk) errors.push("ed25519 signature invalid");
  }
  return {
    signatureOk,
    ok: errors.length === 0,
    schemaOk: true,
    hashOk,
    expectedHash: expected,
    actualHash: receipt.receiptHash,
    errors,
  };
}

// ---- Optional Ed25519 signing ------------------------------------------------

export interface ReceiptSignature {
  alg: "ed25519";
  publicKey: string; // base64 spki der
  signature: string; // base64 over receiptHash utf8
}

export function generateSigningKey(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

export function signReceipt(
  receipt: EvidenceReceipt,
  privateKeyB64: string,
): NonNullable<EvidenceReceipt["signature"]> {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const pub = createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64");
  const sig = edSign(null, Buffer.from(receipt.receiptHash, "utf8"), key);
  return { alg: "ed25519", publicKey: pub, signature: sig.toString("base64") };
}

export function verifyReceiptSignature(receipt: EvidenceReceipt, sig: ReceiptSignature): boolean {
  const key = createPublicKey({
    key: Buffer.from(sig.publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  return edVerify(null, Buffer.from(receipt.receiptHash, "utf8"), key, Buffer.from(sig.signature, "base64"));
}
