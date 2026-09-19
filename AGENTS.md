# Working notes for agents

## Git workflow

- **Always commit AND push after every update.** Follow OSS conventions:
  small logical commits, conventional-commit style titles
  (`feat(scope):`, `fix(scope):`, `docs:`), message explains *why* not just
  *what*. Push to `origin main` once the working tree validates.
- Before committing: `pnpm format`, `pnpm typecheck`, `pnpm test`.
- Never commit `.env`, DB files, or secrets — CI secret-scans tracked files.

## Verify

```bash
pnpm format:check && pnpm typecheck && pnpm test   # fast gate
pnpm demo:check    # 9/9 end-to-end HTTP checks
pnpm e2e           # 15/15 headless-Chrome checks (skips without browser)
pnpm bench         # endpoint latency
pnpm build         # tsc emit check for lib packages
```

## Environment quirks (this dev machine)

- **Docker**: `docker`/`docker-compose` on Windows are shims →
  `wsl -d Ubuntu -- docker`. The daemon runs in WSL Ubuntu as `root:docker`;
  `testrunner` is not in the group and cannot sudo. Working invocation:
  `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -u root -- docker <args>` — the
  `MSYS_NO_PATHCONV` is required or git-bash mangles `/mnt/...` paths.
  Repo on Windows side: `/mnt/d/Github/mirrorgap`.
- **Spawning test servers**: spawn `node --import tsx src/server.ts` with
  `cwd` = `apps/web` — never `pnpm ... dev`; on Windows killing the pnpm
  wrapper orphans the node grandchild and leaks the port.
- **Runtime**: workspace packages export `src/*.ts`; run via `tsx`
  (`--import tsx`), never `node dist/`.
- **Temp paths differ**: Python `/tmp` ≠ git-bash `/tmp` (`D:\ytb_tool_temp`)
  — don't pass `/tmp` paths between runtimes.

## Architecture invariants (don't regress)

- `packages/core` stays pure — no I/O, time as a parameter.
- Zod validates every boundary (CMC, stored JSON, API bodies, MCP input).
- Every surface labels `dataMode`; fixture never presents as live.
- Receipts are self-verifying canonical JSON → SHA-256 (+ Ed25519).
- Secrets (`CMC_API_KEY`, signing key, webhook URLs, tokens) never appear in
  responses, logs, diagnostics, or the UI.
