$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
& pm2.cmd start (Join-Path $projectRoot 'ecosystem.config.cjs') --only mirrorgap-web,mirrorgap-tunnel
if ($LASTEXITCODE -ne 0) { throw 'PM2 could not start MirrorGap' }
& pm2.cmd save
if ($LASTEXITCODE -ne 0) { throw 'PM2 could not save the process list' }
