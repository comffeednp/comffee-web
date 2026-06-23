<#
.SYNOPSIS
  Register a Windows Scheduled Task that triggers the Game Top-Ups SLA sweep every 15 minutes.

.DESCRIPTION
  A paid-but-unfulfilled game top-up must be auto-refunded within its SLA window (default 24h).
  That enforcement lives in /api/cron/game-topup-sla-sweep — but Vercel free-tier crons run only
  ONCE PER DAY, so the daily vercel.json entry is just a backstop. The design calls for this sweep
  to run ~every 15 min from an always-on box (the cafe counter or a small server). This script
  registers that task. It hits the PRODUCTION endpoint with the CRON_SECRET bearer token.

  Run it ONCE on the always-on box. The secret is stored only in the task definition on THIS
  machine (base64-encoded in the action, NOT encrypted, and never written to the repo). Treat the
  box accordingly.

.PARAMETER SiteUrl
  Production site origin, e.g. https://www.comffee.org

.PARAMETER CronSecret
  The same value as the site's CRON_SECRET environment variable (PayMongo/Vercel project env).

.PARAMETER EveryMinutes
  Sweep interval. Default 15.

.EXAMPLE
  .\setup-sla-sweep-task.ps1 -SiteUrl https://www.comffee.org -CronSecret 'paste-CRON_SECRET-here'
#>
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [Parameter(Mandatory = $true)][string]$CronSecret,
  [string]$TaskName = 'ComffeeGameTopupSlaSweep',
  [int]$EveryMinutes = 15
)

$ErrorActionPreference = 'Stop'
$endpoint = ($SiteUrl.TrimEnd('/')) + '/api/cron/game-topup-sla-sweep'

# The task action: a hidden PowerShell that POSTs the sweep endpoint with the bearer token.
# EncodedCommand avoids quoting pitfalls and keeps the secret off a plainly-readable arg list
# (base64 is encoding, not security — the secret still lives on this box, by design).
$inner = "try { Invoke-RestMethod -Method Post -Uri '$endpoint' -Headers @{ Authorization = 'Bearer $CronSecret' } -TimeoutSec 60 | Out-Null } catch { }"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -EncodedCommand $encoded"

# Repeat every N minutes, indefinitely, starting now; catch up if the box was asleep.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

# Idempotent: drop any existing task first so re-running just refreshes it.
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Comffee game top-up SLA sweep every $EveryMinutes min (POST $endpoint)." -RunLevel Limited | Out-Null

Write-Host "Registered '$TaskName' -> POST $endpoint every $EveryMinutes min."
Write-Host "Test now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Remove:    Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
