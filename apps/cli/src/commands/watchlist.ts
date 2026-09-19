import { c, table } from "../format.js";
import { argFlag, has, makeRuntime, resolveRwaId } from "./context.js";

/* ---------------- watchlist ----------------
 * mirrorgap watchlist                     list watched assets
 * mirrorgap watchlist add NVDA            add by symbol (or --id 2)
 * mirrorgap watchlist add NVDA --thresholds 0.3,0.8,1.5,2.5
 * mirrorgap watchlist remove NVDA         remove by symbol or id
 */
export async function watchlist(args: string[]) {
  const sub = args[1];
  const inst = makeRuntime(args);

  if (sub === "add") {
    const target = args[2];
    const idFlag = argFlag(args, "id");
    if (!target && !idFlag) {
      console.error("watchlist add requires a symbol (or --id <rwaId>)");
      process.exit(1);
    }
    const thresholdsRaw = argFlag(args, "thresholds");
    let thresholds = null;
    if (thresholdsRaw) {
      const parts = thresholdsRaw.split(",").map((s) => Number(s.trim()));
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
        console.error("--thresholds expects 4 comma-separated numbers: info,watch,high,critical");
        process.exit(1);
      }
      thresholds = { info: parts[0]!, watch: parts[1]!, high: parts[2]!, critical: parts[3]! };
    }
    try {
      const entry = await inst.runtime.addToWatchlist({
        ...(idFlag ? { rwaId: Number(idFlag) } : { symbol: target!.toUpperCase() }),
        thresholds,
      });
      console.log(
        c.green(`✓ watching ${entry.symbol} (rwa_id ${entry.rwaId})`) +
          (entry.thresholds ? ` — thresholds ${JSON.stringify(entry.thresholds)}` : ""),
      );
    } catch (err) {
      console.error(c.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
    return inst.close();
  }

  if (sub === "remove" || sub === "rm") {
    const target = args[2];
    if (!target) {
      console.error("watchlist remove requires a symbol or rwa_id");
      process.exit(1);
    }
    const rwaId = await resolveRwaId(inst, target);
    if (rwaId === null || !inst.runtime.removeFromWatchlist(rwaId)) {
      console.error(c.red(`${target} is not on the watchlist`));
      process.exitCode = 1;
      return inst.close();
    }
    console.log(c.green(`✓ removed ${target.toUpperCase()} from watchlist`));
    return inst.close();
  }

  if (sub && sub !== "list") {
    console.error(`unknown watchlist subcommand: ${sub} (use add|remove|list)`);
    process.exit(1);
  }

  const list = inst.runtime.listWatchlist();
  if (has(args, "json")) {
    console.log(JSON.stringify(list, null, 2));
    return inst.close();
  }
  if (!list.length) {
    console.log(
      c.dim("watchlist empty — scans fall back to the top-ranked tokenized assets\n") +
        `add one: mirrorgap watchlist add NVDA`,
    );
    return inst.close();
  }
  const rows = list.map((w) => [
    w.symbol,
    String(w.rwaId),
    w.enabled ? c.green("enabled") : c.dim("disabled"),
    w.thresholds
      ? `≥${w.thresholds.info}/≥${w.thresholds.watch}/≥${w.thresholds.high}/≥${w.thresholds.critical}`
      : c.dim("defaults"),
    w.addedAt.slice(0, 10),
  ]);
  console.log(c.bold(`\nWatchlist`) + c.dim(` (${list.length}/${inst.config.watchLimit})`));
  console.log(table(rows, ["symbol", "rwa_id", "state", "thresholds", "added"]));
  inst.close();
}
