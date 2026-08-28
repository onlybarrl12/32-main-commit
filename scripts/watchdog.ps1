# Self-healing watchdog for the SERPL Budget Portal's local deployment.
# Checks all three required processes (Postgres, the Next.js production
# server, and the Cloudflare Tunnel for THIS project specifically -- not
# the other unrelated tunnels/sites also hosted from this machine) and
# restarts anything that's down. Designed to run unattended, invoked from
# two places (see RESTART_RESILIENCE.md): a Scheduled Task every 20
# minutes, and the current user's Startup folder after a reboot/login --
# since this session has no Administrator rights to install real Windows
# Services or a Task Scheduler logon trigger (both confirmed "Access is
# denied" when tried).
#
# Safe to run repeatedly -- every check is an is-it-already-running guard
# before starting anything. Also guards against the two trigger sources
# above overlapping in time (e.g. a reboot landing right on a 20-minute
# tick) via a simple lock file, so they can never race each other trying
# to start the same process twice.

$ErrorActionPreference = "Stop"
$ProjectRoot = "D:\EffCorp_Products\IOCLSERPLBudget\IOCLSERPLBudget"
$WebappRoot = "$ProjectRoot\webapp"
$LogFile = "$ProjectRoot\scripts\watchdog.log"
$LockFile = "$ProjectRoot\scripts\watchdog.lock"
$PgBin = "C:\PGPortable\pgsql\bin"
$PgData = "$ProjectRoot\.pgdata"

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Add-Content -Path $LogFile -Value $line
}

if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 2MB) {
    Remove-Item $LogFile -Force
}

# Lock file guard -- if another run is already in progress (or died
# mid-run less than 5 minutes ago, which we treat as stale and proceed
# anyway rather than deadlock forever), skip this run instead of racing it.
if (Test-Path $LockFile) {
    $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    # Found 2026-08-24: a lock file with a corrupted/future mtime (once seen dated
    # 2030) made $age negative, which is also "-lt 5" -- so the run skipped itself
    # forever instead of ever treating it as stale. [math]::Abs() guards against
    # that regardless of which direction the clock/mtime is off by.
    if ([math]::Abs($age.TotalMinutes) -lt 5) {
        Log "Another run appears to be in progress (lock is $([math]::Round($age.TotalSeconds))s old) -- skipping this run."
        exit 0
    }
    Log "Stale lock file ($([math]::Round($age.TotalMinutes))min old) -- proceeding anyway."
}
New-Item -Path $LockFile -ItemType File -Force | Out-Null

try {

Log "Watchdog run starting."

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

# ---- 1. PostgreSQL ----------------------------------------------------
& "$PgBin\pg_ctl.exe" -D $PgData status *> $null
if ($LASTEXITCODE -ne 0) {
    Log "Postgres is down - starting it."
    & "$PgBin\pg_ctl.exe" -D $PgData -l "$PgData\server.log" -o "-p 5433" start | Out-Null
    Start-Sleep -Seconds 3
    Log "Postgres start attempted."
} else {
    Log "Postgres OK."
}

# ---- 2. Next.js production server (port 3010) --------------------------
# Moved off port 3000 on 2026-08-24 -- that port turned out to already be
# occupied by an unrelated project ("techflowhub") on this shared machine,
# so SERPL now runs on its own dedicated port instead of contending for it.
# See CLOUDFLARE_TUNNEL.md and webapp/package.json's "start" script (next
# start -p 3010) and serpl-config.yml's ingress, which must all agree.
$appUp = $false
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3010/login" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $appUp = $true }
} catch {
    $appUp = $false
}

if (-not $appUp) {
    Log "App server is down - starting npm run start."
    $startArgs = "/c cd /d ""$WebappRoot"" && npm run start >> ""$ProjectRoot\scripts\app.log"" 2>&1"
    Start-Process -FilePath "cmd.exe" -ArgumentList $startArgs -WindowStyle Hidden
    Start-Sleep -Seconds 5
    Log "App server start attempted."
} else {
    Log "App server OK."
}

# ---- 3. Cloudflare Tunnel for THIS project ------------------------------
$ourTunnel = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -like "*serpl-config.yml*" }

if (-not $ourTunnel) {
    Log "SERPL tunnel is down - starting it."
    $tunnelArgs = "tunnel --config ""C:\Users\asus\.cloudflared\serpl-config.yml"" run"
    Start-Process -FilePath "cloudflared.exe" -ArgumentList $tunnelArgs -WindowStyle Hidden
    Start-Sleep -Seconds 5
    Log "Tunnel start attempted."
} else {
    Log "Tunnel OK (PID $($ourTunnel.ProcessId))."
}

Log "Watchdog run complete."

} finally {
    Remove-Item -Path $LockFile -Force -ErrorAction SilentlyContinue
}
