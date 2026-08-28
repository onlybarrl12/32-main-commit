# Restart resilience — surviving a system reboot

**Status: live**, as of 2026-08-18. Addresses the explicit requirement: *"even when the system restarts, it should automatically get up and running... it can wait a few seconds, but the website should eventually be up and running"* — and specifically, that it must not conflict or cause congestion with the other unrelated sites/processes also hosted on this same laptop (`techflowhub`, `billing-app`) which are themselves restarting around the same moment.

This is a direct continuation of `CLOUDFLARE_TUNNEL.md`'s "Persistence" section, which had already solved *mid-session crash recovery* (the 20-minute watchdog) but explicitly flagged reboot survival as unsolved. This document covers that remaining gap.

## The constraint everything here works around

**This session has no Administrator rights.** Confirmed multiple times, not assumed:
- `Register-ScheduledTask` → `Access is denied`
- `schtasks /create /sc onlogon` (a logon-triggered task) → `Access is denied`
- An XML task definition with a `<LogonTrigger>` → `Access is denied`
- Real Windows Services (`cloudflared service install`, NSSM, `pg_ctl register`, etc.) all require the same elevation

So nothing here can start *before* a user logs into Windows — that specifically needs a real Service, which needs elevation this session doesn't have. If that matters (fully unattended reboot with no one logging in), it needs the user to run the elevated setup themselves; see "What would close the remaining gap" at the bottom.

## What actually works without elevation: the Startup folder

Placing something in the *current user's* Startup folder (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`) makes Windows run it automatically the moment that user logs in — no Task Scheduler involved at all, so the logon-trigger elevation wall above doesn't apply. This only needs write access to the user's own profile folder.

**What's there**: `SERPL-Portal-Startup.lnk`, a shortcut pointing at `scripts/run-startup-hidden.vbs` (kept in the git repo, not duplicated into the Startup folder — the shortcut is just a pointer, so there's one source of truth).

## The startup sequence, and why it's built this way

Reboot → user logs in → `SERPL-Portal-Startup.lnk` fires → `run-startup-hidden.vbs` (hidden window, same `wscript.exe //B` trick as the watchdog's own wrapper, see `CLOUDFLARE_TUNNEL.md`) → `scripts/startup.ps1`:

1. **Waits 45 seconds before touching anything.** Right after a reboot, Windows' own network stack, DNS, and the *other* sites/tunnels on this machine are also all initializing. Jumping in immediately risks the Cloudflare Tunnel's outbound connection failing simply because the network isn't fully up yet — not a real failure, just bad timing. The delay sidesteps that instead of racing it.
2. **Retries up to 5 times, 25 seconds apart**, each time delegating to `scripts/watchdog.ps1` (the same idempotent, lock-guarded script the 20-minute Scheduled Task already uses — see `CLOUDFLARE_TUNNEL.md`) and then checking whether the public URL actually responds. Stops as soon as it does. This is the "wait a few seconds, but eventually up" behavior — a single attempt would be fragile against exactly the transient just-booted conditions this is designed for.
3. **If all 5 attempts fail**, it gives up gracefully and logs that — the 20-minute Scheduled Task is still running independently and will keep retrying from there regardless, so this is a soft failure, not a dead end.

## Why this can't conflict with the other sites/processes on this machine

- **No shared config, ever.** `startup.ps1` and `watchdog.ps1` only ever touch `serpl-config.yml` and match the `cloudflared` process list by that filename specifically — they cannot see or touch `techflowhub` or `billing-app`'s tunnels, config, or processes, by construction (same isolation already established in `CLOUDFLARE_TUNNEL.md`'s incident note).
- **No port contention with other projects.** Postgres (5433) and the app (3010, moved off 3000 on 2026-08-24 after discovering `techflowhub` already had it — see `CLOUDFLARE_TUNNEL.md`'s port conflict incident note) are fixed ports unique to this project; the other sites on this machine don't bind them, as far as has been checked.
- **A lock file (`scripts/watchdog.lock`) prevents *our own* two trigger sources from racing each other** — if a reboot happens to land right on a 20-minute Scheduled Task tick, `watchdog.ps1` now checks for an in-progress run before doing anything, so the Startup-folder path and the Scheduled Task path can never both try to start the same process at once. (Full mechanism: a lock file is created at the start of a run and removed at the end; a run that finds an existing lock younger than 5 minutes skips itself entirely; older than 5 minutes is treated as stale — e.g. a previous run that crashed mid-way — and proceeds anyway rather than deadlocking forever.)
- **The 45-second initial delay is itself a courtesy to the rest of the machine** — it's not just about our own reliability, it means this project's processes aren't all slamming into the CPU/network/disk in the first few seconds of boot alongside everything else.

## Verified

Rebooting the shared machine itself was **not** done as part of this verification — it hosts other live sites, and restarting it wasn't something to do without asking first. Instead, the actual Startup-folder shortcut was invoked directly (exactly how Windows itself would invoke it at login), twice:

**First, against an already-healthy state** (proves the delay/retry/early-exit mechanics):
```
17:55:46 [startup] Startup sequence triggered (logon). Waiting 45s...
17:56:31 [startup] Startup attempt 1 of 5.
17:56:34            Watchdog run complete. (Postgres OK / App OK / Tunnel OK)
17:56:37 [startup] Site confirmed reachable on attempt 1. Startup sequence done.
```

**Second, against a deliberately broken state** — the tunnel process was killed and the site confirmed returning an error first, *then* the same shortcut invoked again, to prove the "actually down → detected → fixed" path specifically, not just "already fine":
```
17:57:13  Killed tunnel PID 36248. Confirmed site down.
17:57:32 [startup] Startup sequence triggered (logon). Waiting 45s...
17:58:17 [startup] Startup attempt 1 of 5.
17:58:20            SERPL tunnel is down - starting it.
17:58:26            Tunnel start attempted.
17:58:27 [startup] Site confirmed reachable on attempt 1. Startup sequence done.
```
Total time from a real outage to confirmed-recovered: **~55 seconds** (the 45s courtesy delay plus ~10s to detect, restart, and confirm) — well within "wait a few seconds, but eventually up."

The one thing not literally proven is Windows' own Startup-folder-at-login mechanism itself (as opposed to manually invoking the same shortcut) — that's standard, well-documented Windows behavior, not something specific to this setup, so it wasn't considered worth a disruptive full reboot of a machine hosting other live sites just to confirm. Everything downstream of "the shortcut gets invoked" is proven above with a real failure and a real recovery.

## What would close the remaining gap

For the site to come back *before anyone logs in at all* (a fully unattended reboot, e.g. after a power outage with no one physically present), the Startup-folder approach isn't enough — that specifically needs real Windows Services. If that level of resilience matters:
- The user runs `cloudflared service install` (with the tunnel token or `--config serpl-config.yml`) from an elevated PowerShell.
- Similarly for the app (e.g. via NSSM or `pm2` + `pm2-installer`) and Postgres (`pg_ctl register`, or just let the app-level watchdog keep covering it).

Not done here — it needs the user's elevation, not this session's, and wasn't asked for; the Startup-folder + watchdog combination already satisfies the stated requirement ("wait a few seconds, but eventually up") for the realistic case of the user logging back in after a restart.
