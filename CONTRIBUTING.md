# Contributing

## Setup

```bash
pnpm install && pnpm approve-builds --all   # Node ≥20.10, pnpm 12 (corepack)
pnpm dev                                   # http://localhost:8787 (auto mode)
```

No `CMC_API_KEY` needed for development — fixture mode covers the full engine.

## Workspace layout

| Path               | Contents                                                       |
| ------------------ | -------------------------------------------------------------- |
| `packages/core`    | deterministic engine — pure functions, domain types, no I/O    |
| `packages/cmc`     | CMC adapter + fixture data source (same interface)             |
| `packages/storage` | SQLite store — migrations, repositories, retention             |
| `packages/runtime` | orchestration — scans, lifecycle, alerts, derived views        |
| `apps/web`         | HTTP API + SSE + vanilla SPA (`public/` is the whole frontend) |
| `apps/cli`         | `mirrorgap` CLI — one file per command group                   |
| `apps/mcp`         | MCP server over stdio                                          |

## Rules that keep the system honest

1. **The engine stays pure.** `packages/core` must not import I/O
   (fs/net/env/time). Time is a parameter. Same inputs → same outputs, always.
2. **Zod at every boundary.** CMC responses, stored JSON, API bodies, MCP
   inputs — validate, don't cast.
3. **Live/fixture honesty.** Any surface that could confuse a reader about
   data origin must carry `dataMode`. Fixture output may never present as
   live.
4. **Determinism beats cleverness.** No randomness in the engine, no hidden
   clocks, no ambient state. Fixture scenarios are scripted tick-by-tick.
5. **Claims are classified.** Anything presented as fact in an investigation
   must trace to `observed`/`derived`/`supported_hypothesis`/`unknown`.
6. **No secrets.** `CMC_API_KEY`, `MIRRORGAP_SIGNING_KEY`, webhook URLs, and
   tokens never appear in responses, logs, diagnostics, or the UI.
7. **Files >200 lines** — consider splitting into focused modules (kebab-case,
   descriptive names).

## Workflow

```bash
pnpm format          # prettier — required before commit
pnpm typecheck       # strict TS, all packages
pnpm test            # vitest across the workspace
pnpm demo:check      # end-to-end smoke (fixture server + receipt verify)
pnpm e2e             # headless-Chrome smoke (needs a local Chrome/Edge)
pnpm bench           # endpoint latency benchmark
```

CI runs format check → typecheck → tests → demo:check → secret scan →
docker build. Keep it green.

## Tests

- Put unit tests next to the package (`packages/*/test/*.test.ts`).
- HTTP surface tests live in `apps/web/test/api.test.ts` — they boot a real
  server on an ephemeral port with an in-memory DB.
- MCP tool tests live in `apps/mcp/test/tools.test.ts` — call handlers
  directly, no transport needed.
- Prefer testing through the public surface (runtime methods, HTTP routes)
  over internals.

## Migrations

Storage uses ordered migrations (`schema_migrations` table). To add one:
bump the migration list in `packages/storage/src/sqlite.ts`, write
idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `ALTER …`), and cover the
upgrade path in a storage test. Never edit shipped migrations.

## Style

- TypeScript strict, ESM, `.js` import specifiers for TS files.
- No comments unless the code genuinely can't explain itself — but _do_
  document non-obvious invariants (rate limits, guards, hashing rules).
- Prettier is the formatter; run `pnpm format` before committing.
