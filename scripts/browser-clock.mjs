// Only imported by the isolated browser runner. Production never imports this module.
if (process.env.MIRRORGAP_DATA_MODE !== "fixture" || process.env.MIRRORGAP_DB_PATH !== ":memory:") {
  throw new Error("Browser clock requires an isolated in-memory fixture");
}
const NativeDate = Date;
const started = NativeDate.now();
const pinned = NativeDate.parse("2026-09-18T15:00:00.000Z");
globalThis.Date = class extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [pinned + NativeDate.now() - started]));
  }
  static now() {
    return pinned + NativeDate.now() - started;
  }
};
