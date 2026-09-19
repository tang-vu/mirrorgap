# Security policy

## Scope

MirrorGap is a single-process observatory: a Node HTTP server, SQLite
storage, an SPA, a CLI, and an MCP server. It is designed to run on
localhost or behind a deployment platform's TLS/auth edge.

## Secrets handling

| Secret                          | Where it lives | Exposure rules                                                                            |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `CMC_API_KEY`                   | env, server    | server-side only; never in responses, logs, diagnostics, SPA, or bundles                  |
| `MIRRORGAP_SIGNING_KEY`         | env, server    | Ed25519 private seed; only the derived public key is exposed (`/api/v1/verification-key`) |
| `MIRRORGAP_SCAN_TOKEN`          | env, server    | compared against `x-scan-token` header / `?token=` on mutations                           |
| Alert webhook URLs / bot tokens | env, server    | `/api/v1/alerts` returns destination labels only — never URLs or tokens                   |

Tests assert the above (`verification-key never leaks a private key`,
`diagnostics … without secrets`). CI runs a `git grep` secret scan on
tracked files. Never commit `.env` — it is git- and docker-ignored.

## HTTP surface

- **Read endpoints** are public with `access-control-allow-origin: *` — they
  expose only the observatory's own database contents and involve no
  credentials. If you deploy behind auth, tighten this at the proxy.
- **Mutations** (`POST /api/v1/scan`, watchlist writes) are guarded in order:
  1. **Origin/Host check** — a browser mutation whose `Origin` host differs
     from `Host` is rejected (CSRF protection for loopback deployments).
  2. **Access check** — without `MIRRORGAP_SCAN_TOKEN`, mutations are
     loopback-only (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`); with it,
     `x-scan-token` (or `?token=`) is required.
  3. **Rate limit** — 30 mutations/min/IP → `429` + `retry-after`.
- **Bodies** — hard-capped at 64 KiB (`413 payload_too_large`), strict JSON
  (`400 bad_json`), then zod validation (`400` with a field-level message).
- **Query params** — bounded integers (clamped to documented ranges),
  allowlisted enums (`bad_status`, `bad_window`), id patterns (`bad_id`).
- **Error envelope** — `{ error: { code, message } }`; 500s are wrapped and
  carry no stack traces.
- **Headers** — `content-security-policy: default-src 'self'` (scripts from
  self only; inline styles permitted for dynamic widths),
  `x-content-type-options: nosniff`, `x-frame-options: DENY`,
  `referrer-policy: no-referrer`, `permissions-policy` for
  camera/mic/geolocation.
- **Static serving** — path normalization + `..` rejection; only files
  under `apps/web/public` are served.
- **SSE** — `/api/v1/stream` is read-only; no input beyond the GET.

## Data integrity

- Evidence receipts are canonical JSON → SHA-256 (+ optional Ed25519).
  `POST /api/v1/receipts/verify` accepts _any_ receipt JSON and returns a
  schema/hash/signature verdict — verification needs no trust in this
  server.
- Stored domain payloads are re-validated by zod on read — a corrupted DB
  row surfaces as an error, not silent bad data.
- SQLite runs WAL with foreign keys on; migrations are ordered and
  idempotent.

## Supply chain

- Dependencies are pinned in `pnpm-lock.yaml` (`--frozen-lockfile` in CI and
  Docker).
- Install scripts are allowlisted (`allowBuilds` in `pnpm-workspace.yaml`:
  `better-sqlite3`, `esbuild` only).
- The web UI has **no runtime dependencies and no build step** — the entire
  frontend is auditable files in `apps/web/public`.

## Not in scope (by design)

- No user accounts, sessions, or cookies — nothing to steal.
- No outbound calls except the configured CMC endpoints and alert webhooks.
- The optional LLM narrator only re-words an already-computed claim ledger;
  it cannot inject claims, call tools, or see secrets (key stays in env).

## Reporting

Found something? Please open a private security advisory on the repository
rather than a public issue, and include the affected route/component plus a
reproduction.
