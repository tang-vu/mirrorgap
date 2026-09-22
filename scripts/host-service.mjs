// PM2 entrypoint for this machine's named-tunnel deployment.
// Secrets stay in the ignored .env.host file, outside PM2's saved environment.
import { existsSync, mkdirSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
loadEnvFile(join(root, ".env.host"));
if ((process.env.MIRRORGAP_SCAN_TOKEN ?? "").length < 32) {
  throw new Error("Public hosting requires a local MIRRORGAP_SCAN_TOKEN of at least 32 characters");
}
process.env.MIRRORGAP_HOST = "127.0.0.1";
process.env.PORT = "8798";
process.env.MIRRORGAP_PUBLIC_URL = "https://mirrorgap.tangvu.dev";
process.env.MIRRORGAP_DATA_MODE ??= "fixture";
process.env.MIRRORGAP_DB_PATH ??= join(root, "data", "host", "mirrorgap.db");
process.env.MIRRORGAP_SCAN_INTERVAL ??= "60";
process.env.MIRRORGAP_RETENTION_DAYS ??= "30";
process.env.MIRRORGAP_FIXTURE_SCENARIO ??= "incident_cycle";
process.env.MIRRORGAP_NO_LOOP = "0";
// Preserve history on restart. Seeding is only for the first fixture boot.
process.env.MIRRORGAP_SEED_TICKS =
  process.env.MIRRORGAP_DATA_MODE === "fixture" && !existsSync(process.env.MIRRORGAP_DB_PATH) ? "31" : "0";
mkdirSync(dirname(process.env.MIRRORGAP_DB_PATH), { recursive: true });
await import("../apps/web/src/server.ts");
