#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const entry = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const r = spawnSync("pnpm", ["tsx", entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 0);
