# Cloudflare Tunnel — public access setup

**Status: live.** The portal is reachable at **https://serpl.efficientcorporates.in**, tunneled from this laptop via `cloudflared`. No code changes were needed for this — unlike the Workers/D1 migration (`CLOUDFLARE_MIGRATION.md`, still deferred), the app runs exactly as it does locally; Cloudflare just proxies public traffic to it.

## What's running

Three things must all be up simultaneously for the site to be reachable:

1. **PostgreSQL** (portable binaries) — `C:\PGPortable\pgsql\bin\pg_ctl.exe -D "<project root>\.pgdata" -o "-p 5433" start` (see CLAUDE.md §8).
2. **The Next.js app, in production mode** — `npm run build && npm run start` in `webapp/`, listening on `localhost:3010` (moved off 3000 on 2026-08-24 — see the incident note below). Not `npm run dev` — production mode was chosen deliberately for a publicly-reachable deployment (faster, no dev-mode debug info exposed).
3. **The Cloudflare Tunnel** — `cloudflared tunnel --config "C:\Users\<user>\.cloudflared\serpl-config.yml" run`.

**This is a laptop-hosted tunnel, not real production infrastructure.** The site is only reachable while all three of the above are running on this specific machine. A **self-healing watchdog** (see "Persistence" below) now checks and restarts all three every 20 minutes, with no visible window, which covers the most likely failure mode (any one process dying/getting killed). A **reboot** is covered separately by a Startup-folder script that fires at login — see `RESTART_RESILIENCE.md` — so the realistic "laptop restarted, user logs back in" case is now handled too. What's still not covered: a fully unattended reboot with nobody logging in at all (that needs real Windows Services, which need admin rights this session doesn't have — also explained in that doc). Fine for sharing/demoing; not a substitute for real hosting with a guaranteed SLA.

## Cloudflare-side setup

- **Domain**: `efficientcorporates.in`, already on Cloudflare nameservers (pre-existing, not something this project set up).
- **Tunnel**: `serpl-budget-portal`, ID `0cd8fe01-e523-47e4-bda6-1d2f844d2f30` — created specifically for this project, completely separate from the `techflowhub` tunnel that was already running on this same machine for an unrelated site (`techflowhub.co.in`). **Never share a tunnel or its config across unrelated projects on this machine** — see the incident note below for why.
- **Config file**: `C:\Users\<user>\.cloudflared\serpl-config.yml` (deliberately *not* the default `config.yml`, which belongs to the `techflowhub` tunnel):
  ```yaml
  tunnel: 0cd8fe01-e523-47e4-bda6-1d2f844d2f30
  credentials-file: C:\Users\<user>\.cloudflared\0cd8fe01-e523-47e4-bda6-1d2f844d2f30.json
  ingress:
    - hostname: serpl.efficientcorporates.in
      service: http://localhost:3010
    - service: http_status:404
  ```
- **DNS record**: a proxied CNAME, `serpl.efficientcorporates.in` → `0cd8fe01-e523-47e4-bda6-1d2f844d2f30.cfargotunnel.com`, created via direct Cloudflare API call (not `cloudflared tunnel route dns` — see incident note).

## Credentials

- `<project root>/.env` (**not** `webapp/.env`, and gitignored separately from it) holds `CLOUDFLARE_API_TOKEN` — a token scoped to **only** the `efficientcorporates.in` zone (Zone → DNS → Edit, that one zone). Verified by listing zones visible to the token: exactly one (`efficientcorporates.in`). This token is what's used for any future direct Cloudflare API calls (e.g. adding another hostname) — deliberately *not* the account-wide `cert.pem`, for the reason below.
- `webapp/.env` has `AUTH_URL="https://serpl.efficientcorporates.in"` and `AUTH_TRUST_HOST=true` — required so NextAuth builds correct callback URLs and accepts the Host header cloudflared forwards, rather than trying to infer the canonical URL from request headers (unreliable behind a tunnel). Verified via a real login through the public URL (CSRF token → credentials POST → session cookie → authenticated page render).

## Incident note — don't repeat this

The first attempt used `cloudflared tunnel route dns serpl-budget-portal serpl.efficientcorporates.in`. This is the *normal*, documented way to do it — but it silently ignored the tunnel name given on the command line and fell back to the `techflowhub` tunnel instead (confirmed: `cloudflared tunnel info <name>` resolves wrong, `cloudflared tunnel info <uuid>` resolves correctly — a real bug/quirk in this cloudflared install's name resolution). It also didn't recognize `efficientcorporates.in` as an authorized zone and, instead of failing cleanly, created a malformed CNAME (`serpl.efficientcorporates.in.techflowhub.co.in`) under the *other* project's zone.

Root cause: the pre-existing `cert.pem` (from an earlier `cloudflared tunnel login`) is scoped to exactly one zone — `techflowhub.co.in` — and Cloudflare's own guidance confirms a single `cert.pem` cannot authorize multiple zones for DNS routing; re-running `login` for a second zone would just overwrite which one zone it covers, not add to it. That's a bad fit for this machine, which hosts multiple unrelated sites.

**Fix applied, and the pattern to reuse for any future domain added to this machine**: don't use `cloudflared tunnel route dns` at all. Create the tunnel via `cloudflared tunnel create <name>` (account-level, not zone-scoped, so this part is safe), then create the DNS record as a direct Cloudflare API call using a token scoped to *only* the target zone:
```
POST https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records
{ "type": "CNAME", "name": "<subdomain>", "content": "<tunnel-id>.cfargotunnel.com", "proxied": true, "ttl": 1 }
```
A zone-scoped token makes it *impossible* to touch another project's zone even by mistake, which the `cert.pem`/`login` approach does not guarantee.

**Cleanup still pending**: the malformed `serpl.efficientcorporates.in.techflowhub.co.in` CNAME record is still sitting in the `techflowhub.co.in` zone. It's inert (nothing queries it, doesn't conflict with `techflowhub.co.in`/`www.techflowhub.co.in`'s real records) but should be deleted via the dashboard when convenient — the user said they didn't want to touch it themselves during this session; not urgent, just noted so it isn't forgotten.

## Outage incident (2026-08-17) — why the watchdog exists

The site went down between sessions: all three processes had been started as ordinary background shell processes, and when that session ended, the tunnel process for `serpl-budget-portal` specifically was gone (confirmed via `cloudflared tunnel info 0cd8fe01-...` → "does not have any active connection", while an *unrelated* tunnel for another site on this machine, `billing-app`, was running fine — so it wasn't a Cloudflare-wide problem, just ours). Public URL returned `530` (Cloudflare: no tunnel connector for that hostname). Fixed by restarting the tunnel process, then addressed properly per "Persistence" below so it self-heals instead of needing another manual fix next time.

## Port conflict incident (2026-08-24) — SERPL moved off port 3000

Picking this project back up after a gap, the app and tunnel were both down (`530` on the public URL) — but the deeper finding was that even a fresh `npm run start` would have failed anyway: **port 3000 was already bound by an unrelated project on this same machine** (`techflowhub`, its own Next.js server, not through a tunnel — the raw port itself was occupied), confirmed by `curl http://localhost:3000/` returning TechFlow Hub's own HTML, and `Get-NetTCPConnection -LocalPort 3000` resolving to a non-SERPL process. `scripts/app.log` shows this had already bitten a prior run too (`EADDRINUSE :::3000`), so the site had likely been unreachable for a while before this was ever diagnosed. RESTART_RESILIENCE.md's earlier claim that "the app (3000)" was a port "unique to this project" was wrong — flagged and fixed here rather than left stale.

**Rather than stop whatever `techflowhub` process held port 3000** (a different project's live process, not this session's to touch without checking), SERPL was moved to its own dedicated port instead: `webapp/package.json`'s `start` script is now `next start -p 3010`, `serpl-config.yml`'s ingress now points at `http://localhost:3010`, and `scripts/watchdog.ps1`'s health check follows. If you ever see `530`/site-down again, check `netstat`/`Get-NetTCPConnection -LocalPort 3010` first to confirm SERPL still has that port to itself before assuming the fix here still holds — another project could in principle claim 3010 later the same way `techflowhub` claimed 3000.

## Persistence

**This session has no Administrator rights** (confirmed: `IsInRole(Administrator)` → `False`), which rules out real Windows Services (`cloudflared service install`, NSSM, etc. all need elevation) and even `Register-ScheduledTask` (tried — `Access is denied`). The fallback that *does* work without elevation:

- **`scripts/watchdog.ps1`** — checks Postgres (`pg_ctl status`), the app (`GET localhost:3010/login`), and specifically the `serpl-config.yml`-tagged `cloudflared` process (matched by command line, so it never confuses our tunnel with `techflowhub` or `billing-app`'s), and starts whichever is down. Idempotent — safe to run as often as you like. Logs to `scripts/watchdog.log`.
- **`scripts/run-watchdog-hidden.vbs`** — a thin wrapper that launches `watchdog.ps1` via `WScript.Shell.Run(..., 0, True)`. This exists because Task Scheduler calling `powershell.exe -WindowStyle Hidden` directly still flashes a visible console window (a known PowerShell 5.1 quirk) — routing through `wscript.exe //B` avoids that entirely, since `wscript.exe` never allocates a console in the first place.
- **Scheduled Task `SERPL-Watchdog`** (created via `schtasks.exe /create ... /sc minute /mo 20`, not `Register-ScheduledTask` or an XML task definition — both of those need elevation too, confirmed by trying) — runs the VBS wrapper **every 20 minutes**, no visible window. Verified working end-to-end: manually killed the tunnel process, confirmed the site actually returned `502`, ran the task, confirmed the log showed it detecting and restarting the tunnel, confirmed the site returned `200` again afterward.
- **No "at logon" trigger** — tried (`schtasks /create /sc onlogon`), also `Access is denied`. Apparently logon-type triggers specifically need elevation on this machine even though interval triggers don't. Net effect: after a reboot, recovery takes up to 20 minutes (whenever the next scheduled tick lands) rather than being instant at login — worse than originally planned, but still far better than needing a manual fix.
- **Power settings**: both AC and DC (battery) sleep/standby timeouts set to "never" (`powercfg /change standby-timeout-dc 0`; AC was already 0) — a sleeping laptop pauses every process on it regardless of how well they're supervised, so this matters as much as the watchdog does.

**Reboot survival**: since a Scheduled Task logon trigger needs elevation this session doesn't have (confirmed above), reboot recovery is instead handled via a shortcut in the current user's Startup folder (no elevation needed for that) — see `RESTART_RESILIENCE.md` for the full mechanism, why it's built with an initial delay and a retry loop, and why it can't conflict with the other unrelated sites/tunnels also hosted on this machine. That closes the "user logs back in after a reboot" case. What's still not covered is a fully unattended reboot with nobody logging in — that needs real Windows Services, which need admin rights; not done, since it needs the user's elevation, not this session's, and wasn't asked for.
