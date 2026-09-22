# Windows PM2 + Cloudflare named tunnel

Public hostname: `https://mirrorgap.tangvu.dev`. Origin: `127.0.0.1:8798`.

## Services and storage

- `mirrorgap-web`: Node + tsx, one process, 60-second scan loop, auto-restart. Only listens on loopback.
- `mirrorgap-tunnel`: dedicated named Cloudflare tunnel. Its ingress only publishes the MirrorGap hostname; unmatched hosts return 404.
- `data/host/mirrorgap.db`: persistent SQLite history. The first fixture boot seeds 31 scans; subsequent starts reuse the database without reseeding.
- `.env.host`: ignored local settings and mutation token. Never commit or print this file. The launcher loads it inside the application, so credentials are not placed in the PM2 ecosystem file.
- `%USERPROFILE%/.cloudflared/mirrorgap.yml`: machine-local tunnel ID, credentials path and ingress. Tunnel credentials remain outside the repository.
- `data/host/logs/`: application and tunnel logs, ignored by Git.

The current public deployment uses **fixture data**, visibly labelled synthetic. No live CMC data is claimed. To enable live data, provision a CMC key in `.env.host`, set `MIRRORGAP_DATA_MODE=live`, and select a separate database path so fixture and live history are not mixed.

## Operations

```powershell
pm2 status
pm2 restart mirrorgap-web
pm2 restart mirrorgap-tunnel
pm2 logs mirrorgap-web --lines 30
pm2 save
```

Start both services with `powershell -File scripts/start-host.ps1`. A Windows logon task named `MirrorGap PM2 Start` uses this script for the current user. This is recovery after user login, **not before-login boot hosting**. Other projects and their scheduled tasks are left untouched.

Public readers can browse observations, compare quotes and verify/export evidence. Scan triggers and shared watchlist writes require the private scan token; it is never embedded in the frontend. For administrative API calls, use the `x-scan-token` header rather than a URL query parameter.

The machine, network, PM2 and tunnel must stay running for the public site to work. Keep a backup of the SQLite database using SQLite's backup facility or a copy while the web process is stopped; copying only a live `.db` file can omit WAL changes.

To stop only this project:

```powershell
pm2 stop mirrorgap-web mirrorgap-tunnel
Disable-ScheduledTask -TaskName 'MirrorGap PM2 Start'
pm2 save
```

Deployment references: [Cloudflare local tunnel setup](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/), [PM2 ecosystem configuration](https://pm2.keymetrics.io/docs/usage/application-declaration/).

## Deployment verification — 22 September 2026

- Public HTTPS UI, health, readiness, radar and workbench returned HTTP 200 with fixture mode.
- Both local and public SSE returned `text/event-stream` and the initial `hello` event.
- Public scan without the private token returned HTTP 403 `scan_token_required`.
- Both PM2 processes were online. Running the logon task completed with result 0 and restarted only the configured MirrorGap services.
- The persistent snapshot count survived that restart (392 before, 413 after subsequent scheduled scans); the origin listener was confirmed as `127.0.0.1:8798`.
- Format, typecheck, 107 unit/API tests, build and 9 HTTP demo checks passed. Host environment and database files are Git-ignored.

DNS routing commands on this machine must include the explicit MirrorGap `--config` path and tunnel UUID. The default global Cloudflare configuration belongs to another project and can override tunnel selection. No other hostname should be overwritten.
