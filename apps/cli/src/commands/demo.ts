import { seedHistory } from "@mirrorgap/runtime";
import { c } from "../format.js";
import { argFlag, makeRuntime } from "./context.js";

/* ---------------- seed ----------------
 * Replay N deterministic fixture scans (1 min apart, ending now) through the
 * real pipeline — builds incident history for the demo in seconds.
 * Fixture mode only.
 */
export async function seed(args: string[]) {
  const inst = makeRuntime(args);
  if (inst.config.dataMode !== "fixture") {
    console.error(c.red("seed is only available in fixture mode (--fixture)"));
    process.exit(1);
  }
  const ticks = Math.max(1, Math.min(1000, Number(argFlag(args, "ticks") ?? "31")));
  const t0 = Date.now();
  const { scans } = await seedHistory(inst.runtime, { ticks });
  const events = inst.runtime.listEvents({ limit: 1000 });
  console.log(
    c.green(`✓ seeded ${scans.length} scans in ${Date.now() - t0}ms`) +
      c.dim(` — ${events.length} incidents on record`),
  );
  for (const e of events.slice(0, 8)) {
    console.log(
      `    ${e.eventId}  ${e.assetSymbol} ${e.kind} ${e.severity} [${e.status}] peak ${e.maxDeviationPct.toFixed(2)}%`,
    );
  }
  inst.close();
}

/* ---------------- serve ---------------- */
export async function serve(args: string[]) {
  const port = argFlag(args, "port");
  if (port) process.env.PORT = port;
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const webDir = fileURLToPath(new URL("../../../web", import.meta.url));
  const child = spawn("pnpm", ["dev"], {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
}
