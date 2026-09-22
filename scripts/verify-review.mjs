import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Deliberately standalone: a reviewer needs Node, not the MirrorGap server.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
try {
  if (!process.argv[2]) throw new Error("Usage: node scripts/verify-review.mjs review.json");
  const { reportHash, ...body } = JSON.parse(readFileSync(process.argv[2], "utf8"));
  if (body.schema !== "mirrorgap.workbench.v1") throw new Error("Not a MirrorGap workbench report");
  const actual = "sha256:" + createHash("sha256").update(canonical(body)).digest("hex");
  const ok = typeof reportHash === "string" && reportHash === actual;
  console.log(
    JSON.stringify(
      {
        ok,
        dataMode: body.dataMode,
        expected: reportHash,
        actual,
        limitation: "Integrity only; source authenticity and correctness are not established.",
      },
      null,
      2,
    ),
  );
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
