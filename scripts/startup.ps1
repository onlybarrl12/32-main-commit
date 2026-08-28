# Runs once when the user logs in (via the Startup folder -- see
# RESTART_RESILIENCE.md), specifically to handle the "just rebooted"
# case: everything is down (Postgres, the app, the tunnel all ran as
# plain processes, none survive a restart), and other things on this
# machine -- Windows itself, network drivers, DNS, the other unrelated
# sites/tunnels also hosted here -- are *also* all starting up around
# the same moment. Two deliberate design choices to avoid piling onto
# that:
#
# 1. An initial delay before doing anything, so this isn't racing
#    Windows' own boot-time network initialization.
# 2. A short retry loop rather than one attempt -- if the network genuinely
#    isn't up yet on the first try, we wait and try again a few times,
#    rather than giving up and relying solely on the next 20-minute
#    Scheduled Task tick.
#
# Delegates the actual "check each of the 3, start whichever is down"
# logic to watchdog.ps1, which is already idempotent and lock-guarded --
# so calling it repeatedly here is safe and cheap once things are up.

$ProjectRoot = "D:\EffCorp_Products\IOCLSERPLBudget\IOCLSERPLBudget"
$WatchdogScript = "$ProjectRoot\scripts\watchdog.ps1"
$LogFile = "$ProjectRoot\scripts\watchdog.log"

$InitialDelaySeconds = 45
$MaxAttempts = 5
$RetryDelaySeconds = 25

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [startup] $msg"
    Add-Content -Path $LogFile -Value $line
}

Log "Startup sequence triggered (logon). Waiting ${InitialDelaySeconds}s before touching anything, to let Windows/network finish its own boot-time startup first."
Start-Sleep -Seconds $InitialDelaySeconds

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Log "Startup attempt $attempt of $MaxAttempts."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WatchdogScript

    try {
        $r = Invoke-WebRequest -Uri "https://serpl.efficientcorporates.in/login" -UseBasicParsing -TimeoutSec 10
        if ($r.StatusCode -eq 200) {
            Log "Site confirmed reachable on attempt $attempt. Startup sequence done."
            exit 0
        }
    } catch {
        Log "Attempt $attempt : site not reachable yet ($($_.Exception.Message))."
    }

    if ($attempt -lt $MaxAttempts) {
        Start-Sleep -Seconds $RetryDelaySeconds
    }
}

Log "Gave up after $MaxAttempts attempts -- local processes should still be starting; the 20-minute Scheduled Task will keep retrying from here."
