import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRuntime } from "../packages/runtime/src/factory.js";
import { loadDotEnv } from "../packages/runtime/src/dotenv.js";

// Run from apps/web: node --import tsx ../../scripts/cmc-evidence.ts
// No account/key-info response, credentials or request headers are exported.
loadDotEnv();
loadDotEnv(resolve("../.."));
if (!process.env.CMC_API_KEY) {
  console.log(
    JSON.stringify({ status: "skipped", reason: "CMC_API_KEY is not configured; no live claim made" }),
  );
} else {
  const inst = createRuntime({ dataMode: "live", dbPath: ":memory:" });
  try {
    const result = await inst.runtime.source.getRwaQuotes({ symbol: ["NVDA"] }, "USD");
    const evidence = {
      dataMode: "live",
      endpoint: result.provenance.endpoint,
      retrievedAt: result.provenance.retrievedAt,
      params: result.provenance.params,
      creditCount: result.creditCount,
      response: result.data,
      note: "Actual validated CMC response; not an independent underlying quote or CMC-signed attestation.",
    };
    const dir = resolve("../../data");
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "cmc-live-evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify({
        status: "captured",
        dataMode: "live",
        endpoint: evidence.endpoint,
        assets: result.data.length,
        creditCount: result.creditCount,
        file: "data/cmc-live-evidence.json",
      }),
    );
  } catch {
    console.log(
      JSON.stringify({
        status: "failed",
        reason: "Live CMC call failed; inspect sanitized diagnostics locally",
      }),
    );
    process.exitCode = 1;
  } finally {
    inst.close();
  }
}
