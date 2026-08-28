# Cloudflare Workers Migration Roadmap

**Status: planning only — no code changed yet.** Written 2026-08-12 at the user's request, to revisit later. Do not start executing this without the user's explicit go-ahead; it's a real architectural migration, not a config tweak.

## Why this exists

The user wants the portal hosted on Cloudflare Workers, reachable at a `*.workers.dev` URL, so it can be shared with anyone on the internet. They gave a Cloudflare Account ID (`68e19e5bed11326478a23d6e2ad31453`) and asked whether the current app could simply be deployed there via `wrangler`.

**It can't be deployed as-is.** The current app assumes things that don't exist in the Workers runtime:

| Current assumption | Why it breaks on Workers |
|---|---|
| Postgres at `127.0.0.1:5433` | That's this laptop only — Cloudflare's network can never reach it. No fix short of a real internet-reachable database. |
| `bcrypt` for password hashing | Native Node addon (compiled C++ binding) — Workers can only run JS/WASM, no native code. |
| Local-disk file attachments (`.data/attachments/`) | Workers have no persistent filesystem — nothing written to disk survives past a single request. |
| Plain Node.js server | Next.js needs an adapter (`@opennextjs/cloudflare`) to run on Workers at all; even then, some Node APIs are unsupported or partial. |

The user chose **Cloudflare D1** (not an external Postgres like Neon) as the target database — this is the more invasive of the two options discussed, since D1 is SQLite-based and the current schema is Postgres-flavored (native `Decimal`, native enums, etc.). Documented here as the chosen path.

## Target architecture

```
Browser → workers.dev URL → Cloudflare Worker (Next.js via OpenNext)
                                    ├── D1 (SQLite) — replaces local Postgres
                                    ├── R2 bucket — replaces local-disk attachments
                                    └── Workers Secrets — AUTH_SECRET, etc.
```

## Phase 0 — Access & prerequisites (needs the user)

- Generate a **Cloudflare API Token** (the Account ID alone cannot authenticate `wrangler` — no browser OAuth is possible from an unattended session). Dashboard → My Profile → API Tokens → Create Token, scoped to:
  - `Workers Scripts:Edit`
  - `D1:Edit`
  - `R2:Edit`
  - `Account Settings:Read`
- Confirm whether the account already has a `workers.dev` subdomain claimed (first deploy prompts for one if not).
- Make the token available as `CLOUDFLARE_API_TOKEN` for the session doing the deploy.

## Phase 1 — Database: Postgres → D1 (highest-risk phase)

A genuine SQL-dialect migration, not a connection-string swap.

- `schema.prisma`: `provider = "postgresql"` → `"sqlite"`; swap `@prisma/adapter-pg` → `@prisma/adapter-d1`.
- **Must validate early, before building anything on top:**
  - `Decimal(18,2)` monetary fields — confirm current Prisma-on-D1 support preserves full precision, not silently coerced to float.
  - Native Postgres enums (`Role`, `BudgetStatus`, `WorkType`, `RecurringType`, `ScopeType`, `ApprovalActionType`, `ActualsDataType`) — Prisma emulates these as `TEXT` + `CHECK` on SQLite; needs a real round-trip test, not just a docs read.
  - Cascading deletes / FK enforcement — confirm D1's `PRAGMA foreign_keys` behavior matches what the schema's `onDelete: Cascade` relations expect.
- Provision: `wrangler d1 create <name>` → get `database_id` → wire into `wrangler.toml`.
- Fresh migration generated for the SQLite-flavored schema, applied via `wrangler d1 migrations apply` (not a `pg_dump`/restore from the existing Postgres instance — binary dump formats aren't compatible across engines).
- **Data**: re-run the existing `prisma/seed.ts` (same source Excel files in `business_knowledge/`) directly against D1, rather than trying to migrate live data. Any transactional test data created locally during development is not worth carrying over — start clean in D1.
- **Open decision, needs the user's call when this is picked back up**: does local dev keep using the existing Postgres/PGPortable setup (zero change to the daily dev workflow, only the *deployed* Worker uses D1), or does local dev move to D1 too for full parity (`wrangler dev` with a local D1 simulation)? Leaning toward keeping Postgres locally unless full parity turns out to matter.

## Phase 2 — Auth: drop native bcrypt

- `bcrypt` (native addon) → `bcryptjs` (pure JS, same hash format — existing `$2b$...` hashes keep working, no forced password resets).
- Touches: `src/auth.ts`, `prisma/bootstrap-admin.ts`, `src/app/(app)/admin/authorization/actions.ts`.
- NextAuth v5 + JWT sessions (already the setup here) is edge-friendly once bcrypt is gone; shouldn't need further changes.

## Phase 3 — File attachments: local disk → R2

- `wrangler r2 bucket create <name>`, bind it in `wrangler.toml`.
- Rewrite `src/lib/attachments.ts` (`fs.writeFile`/`readFile` → `env.BUCKET.put()`/`.get()`) and `src/app/api/attachments/[id]/route.ts` to stream from R2 instead of disk.

## Phase 4 — Next.js on Workers via OpenNext (second highest-risk phase)

- Install `@opennextjs/cloudflare`, add `open-next.config.ts`, generate `wrangler.toml`/`wrangler.jsonc`, set `compatibility_flags = ["nodejs_compat"]` and a recent `compatibility_date`.
- **Must validate early**: this app leans heavily on Server Actions (Create Budget, Approvals, Authorization, Masters all use them), plus `src/proxy.ts` for route protection, plus streaming responses (the Excel export route). All three need a real smoke test under this adapter as an isolated spike — OpenNext's Cloudflare support is good but has sharp edges worth finding immediately, not after Phases 1-3 are also built on top.

## Phase 5 — Secrets & bindings

- `wrangler secret put AUTH_SECRET`
- D1 binding name (e.g. `DB`), R2 binding name (e.g. `ATTACHMENTS`) declared in `wrangler.toml`.
- `DATABASE_URL` env var goes away entirely — the D1 binding replaces it.

## Phase 6 — Deploy & re-verify

- `wrangler deploy` → real `*.workers.dev` URL.
- Re-run the same verification already done locally, but against the deployed Worker: login flow, full 5-level approval chain, Excel export (with embedded logo), attachment upload/download.
- Recreate the bootstrap admin against D1 (`bootstrap-admin.ts` adapted for the D1 adapter).

## Phase 7 — Ongoing / not blocking

- Free tiers (Workers 100k req/day, D1 ~5GB storage/~5M row-reads per day, R2 10GB storage) are comfortably enough for this app's scale.
- D1 is always-on and Cloudflare-managed — no more manually starting Postgres before working on the deployed version.
- Custom domain vs. bare `workers.dev` is a later, non-blocking decision.

## Suggested sequencing when this is picked back up

Phases 1 and 4 carry the real risk (SQL dialect compatibility, adapter maturity for Server Actions/proxy/streaming). Validate both **in isolation, on a throwaway branch**, before touching auth or attachments — better to find out early if either has a blocking gap than to debug three unfamiliar systems at once. Phases 2, 3, and 5 are mechanical once 1 and 4 are proven out. Phase 6 is testing.
