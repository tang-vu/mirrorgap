import { z } from "zod";
import type { RuntimeInstance } from "@mirrorgap/runtime";

/**
 * Tool definitions shared between the MCP transport and tests. Each tool is
 * a thin deterministic wrapper over MirrorGapRuntime — the engine decides,
 * the LLM only narrates.
 */
export interface ToolDef {
  name: string;
  description: string;
  /** Zod raw shape for MCP inputSchema. */
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function buildTools(instance: RuntimeInstance): ToolDef[] {
  const { runtime, config } = instance;
  return [
    {
      name: "mirrorgap_scan",
      description:
        "Run a MirrorGap observation scan now. Fetches the latest CoinMarketCap RWA data, evaluates parity gaps, cross-wrapper dispersion, freshness, and market state for every watched asset, then updates anomaly event lifecycles. Optionally scope to specific RWA symbols.",
      inputSchema: {
        symbols: z.array(z.string()).optional().describe('Optional RWA symbols, e.g. ["NVDA","TSLA"]'),
      },
      handler: async (args) => {
        const symbols = Array.isArray(args["symbols"]) ? (args["symbols"] as string[]) : undefined;
        const out = await runtime.scan({ ...(symbols?.length ? { symbols } : {}) });
        return {
          scanId: out.scan.scanId,
          dataMode: out.scan.dataMode,
          assetsScanned: out.snapshots.length,
          events: out.events.map((e) => ({
            eventId: e.eventId,
            asset: e.assetSymbol,
            kind: e.kind,
            severity: e.severity,
            status: e.status,
          })),
          anomalies: out.snapshots
            .filter((s) => s.severity !== "none")
            .map((s) => ({
              rwaId: s.rwaId,
              severity: s.severity,
              classification: s.classification,
              referenceState: s.reference.state,
            })),
        };
      },
    },
    {
      name: "mirrorgap_radar",
      description:
        "Integrity radar: the current parity/dispersion/freshness status of every tokenized real-world asset under observation, ranked by divergence. Use this to answer 'is tokenized reality still matching reality?' at a glance.",
      inputSchema: {},
      handler: async () => ({
        dataMode: config.dataMode,
        capabilities: runtime.capabilities(),
        assets: runtime.radar().map(({ asset, snapshot }) => ({
          rwaId: asset.rwaId,
          symbol: asset.symbol,
          name: asset.name,
          severity: snapshot.severity,
          classification: snapshot.classification,
          referenceState: snapshot.reference.state,
          underlyingMarket: snapshot.reference.underlyingMarket,
          maxAbsGapPct: snapshot.gaps.reduce((m, g) => Math.max(m, Math.abs(g.gapPct)), 0) || null,
          dispersionPct: snapshot.dispersion.dispersionPct,
          wrapperCount: snapshot.dispersion.wrapperCount,
          dataQuality: snapshot.dataQuality.score,
          measuredAt: snapshot.measuredAt,
        })),
      }),
    },
    {
      name: "mirrorgap_inspect_asset",
      description:
        "Deep inspection of one tokenized RWA: per-wrapper parity gaps vs the tokenized aggregate reference, cross-wrapper dispersion, reference freshness, underlying market state, data-quality decomposition, and every wrapper/issuer relationship. Accepts an RWA id or symbol.",
      inputSchema: {
        asset: z.string().describe('RWA id (e.g. "2") or symbol (e.g. "NVDA")'),
      },
      handler: async (args) => {
        const t = String(args["asset"]);
        const isId = /^\d+$/.test(t);
        if (!isId) await runtime.scan({ symbols: [t.toUpperCase()] });
        const asset = isId ? runtime.store.getAsset(Number(t)) : runtime.store.findAssetBySymbol(t);
        if (!asset) return { error: `unknown asset ${t}`, hint: "run mirrorgap_scan first" };
        const snapshot = runtime.store.latestSnapshot(asset.rwaId);
        const reps = runtime.store.listRepresentations(asset.rwaId);
        const events = runtime.store.listEvents({ limit: 50 }).filter((e) => e.rwaId === asset.rwaId);
        return { asset, representations: reps, snapshot, events };
      },
    },
    {
      name: "mirrorgap_list_events",
      description:
        "List anomaly events (parity gaps, cross-wrapper dispersion, price differences) with lifecycle status: candidate → confirmed → resolved/invalidated.",
      inputSchema: {
        status: z.enum(["candidate", "confirmed", "resolved", "invalidated"]).optional(),
      },
      handler: async (args) => ({
        events: runtime.listEvents(typeof args["status"] === "string" ? { status: args["status"] } : {}),
      }),
    },
    {
      name: "mirrorgap_get_event",
      description:
        "Full investigation for one anomaly event: the classified claim ledger (observed / derived / supported_hypothesis / unknown), limitations, snapshot evidence, and the verifiable receipt. The claims state exactly what was measured — never invented causes.",
      inputSchema: {
        eventId: z.string(),
      },
      handler: async (args) => {
        const d = runtime.getEventDetail(String(args["eventId"]));
        return d ?? { error: "unknown event" };
      },
    },
    {
      name: "mirrorgap_verify_receipt",
      description:
        "Independently verify a MirrorGap evidence receipt: re-validates the schema, recomputes the canonical SHA-256 receipt hash, and checks the Ed25519 signature when present. Detects any post-issuance tampering.",
      inputSchema: {
        eventId: z.string().optional().describe("Event id whose receipt should be verified"),
        receipt: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Or a raw receipt JSON object to verify"),
      },
      handler: async (args) => {
        if (args["receipt"] && typeof args["receipt"] === "object") {
          const { verifyReceipt } = await import("@mirrorgap/core");
          return verifyReceipt(args["receipt"]);
        }
        const v = runtime.verifyEventReceipt(String(args["eventId"] ?? ""));
        return v ?? { error: "no receipt for event" };
      },
    },
    {
      name: "mirrorgap_cmc_status",
      description:
        "CoinMarketCap integration status: data mode (live vs fixture), plan-gated capability detection, recent API calls with latency/credits, and rate-limit errors. Use to answer 'is this real CMC data?'.",
      inputSchema: {},
      handler: async () => ({
        dataMode: config.dataMode,
        capabilities: runtime.capabilities(),
        recentCalls: instance.diagnostics.entries.slice(-20),
        summary: instance.diagnostics.summary(),
      }),
    },
  ];
}
