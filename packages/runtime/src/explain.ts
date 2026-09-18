import type { AnomalyEvent, IntegritySnapshot, Investigation, RwaAsset } from "@mirrorgap/core";

/**
 * Explanation layer. The deterministic narrator is the source of truth;
 * an optional LLM pass can only re-word it. Inputs to the LLM are bounded to
 * the claim ledger + snapshot numbers — it never sees raw market feeds and
 * cannot introduce claims. Any failure falls back to deterministic output.
 */
export interface Explanation {
  headline: string;
  narrative: string;
  mode: "deterministic" | "llm_assisted";
}

export function explainDeterministic(input: {
  event: AnomalyEvent;
  snapshot: IntegritySnapshot | null;
  investigation: Investigation | null;
  asset: RwaAsset | null;
}): Explanation {
  const { event, snapshot, investigation, asset } = input;
  const name = asset ? `${asset.name} (${asset.symbol})` : event.assetSymbol;
  const kind =
    event.kind === "parity_gap"
      ? "a parity gap vs the tokenized aggregate"
      : event.kind === "cross_wrapper_dispersion"
        ? "cross-wrapper disagreement"
        : "a price difference";
  const headline = `${event.assetSymbol}: ${kind} at ${event.latestDeviationPct.toFixed(2)}% [${event.severity}]`;

  const parts: string[] = [];
  parts.push(
    `MirrorGap detected ${kind} on ${name}, first observed ${event.firstSeenAt} and last confirmed ${event.lastSeenAt} ` +
      `(${event.confirmations} confirmation${event.confirmations === 1 ? "" : "s"}, status ${event.status}).`,
  );
  if (snapshot) {
    parts.push(
      `Reference state was "${snapshot.reference.state}" with underlying market "${snapshot.reference.underlyingMarket}"; ` +
        `aggregate freshness "${snapshot.reference.aggregateFreshness.state}".`,
    );
    if (snapshot.dispersion.wrapperCount >= 2) {
      parts.push(
        `${snapshot.dispersion.wrapperCount} token representations showed ${snapshot.dispersion.dispersionPct?.toFixed(2) ?? "?"}% dispersion ` +
          `(min ${snapshot.dispersion.minTokenSymbol}, max ${snapshot.dispersion.maxTokenSymbol}).`,
      );
    }
  }
  if (investigation) {
    const hyps = investigation.claims.filter((c) => c.kind === "supported_hypothesis");
    if (hyps.length) {
      parts.push(
        `Possible explanations considered (supported hypotheses, not conclusions): ${hyps.map((h) => h.statement).join(" ")}`,
      );
    }
    if (investigation.limitations.length) {
      parts.push(`Limitations: ${investigation.limitations.join(" ")}`);
    }
  }
  parts.push(
    `This finding is ${event.dataMode === "fixture" ? "based on fixture data (demonstration mode)" : "based on live CoinMarketCap observations"}. ` +
      `The evidence receipt (${event.eventId}) can be independently re-hashed and verified.`,
  );
  return { headline, narrative: parts.join(" "), mode: "deterministic" };
}

/**
 * Optional LLM polish. Strictly bounded: receives only the deterministic
 * narrative + claim statements, must return { headline, narrative } JSON,
 * 20s timeout, any failure → deterministic output unchanged.
 */
export async function explainWithOptionalLlm(
  base: Explanation,
  llm: { apiKey: string | null; baseUrl: string; model: string | null },
): Promise<Explanation> {
  if (!llm.apiKey || !llm.model) return base;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(`${llm.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${llm.apiKey}` },
      body: JSON.stringify({
        model: llm.model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content:
              "You rewrite a factual anomaly report for clarity. You MUST NOT add facts, causes, numbers, or entities " +
              'that are not present in the input. Keep it under 120 words. Return JSON: {"headline": string, "narrative": string}.',
          },
          { role: "user", content: JSON.stringify(base) },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return base;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return base;
    const parsed = JSON.parse(m[0]) as { headline?: string; narrative?: string };
    if (!parsed.headline || !parsed.narrative || parsed.narrative.length > 1200) return base;
    return { headline: parsed.headline, narrative: parsed.narrative, mode: "llm_assisted" };
  } catch {
    return base;
  }
}
