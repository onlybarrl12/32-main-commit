# IOCL SERPL Budget Management Portal — Project Knowledge Base

This file is the single source of truth for any AI assistant (or human) picking up this project fresh. It captures the full business context, the decisions already made, the environment setup already done, and exactly what's left to build. Read this before doing anything else.

**Last verified**: 2026-08-12 — **all 15 build-order steps in §9 are done.** Environment set up (Node/Postgres/npm install, see §8), full data layer (schema/migration/seed), Auth+RBAC, and all 8 functional modules (Authorization, Create Budget, Approve Budget, Home Dashboard, Reports+Actuals import, Masters, file attachments) built and verified — mostly against the real running DB directly (`npm run build` clean throughout; several modules also exercised via real HTTP requests with the bootstrap admin login). The app's visual identity was **rebuilt mid-session** per user-supplied UX references (`UXSAMPLE/`, real IndianOil logo) — see §3 for the resulting decisions (6-tab nav, Justification field, Masters consolidation); the color theme specifically was **reworked again same day** after the user reviewed a screenshot and found the teal/stone demo palette too weakly branded — see §3's "Visual style / theme" row for the current IndianOil navy/orange-driven palette, applied to buttons, active nav, charts, and tables throughout, not just the logo/letterhead. Nothing is committed to git yet (§8). **What's NOT done**: nothing from the original build order — the project is functionally complete against CLAUDE.md's own spec as it now reads. A **Cloudflare Workers deployment** was requested and scoped but explicitly deferred by the user — see `CLOUDFLARE_MIGRATION.md` at the project root for the full phased roadmap (D1 + R2 + OpenNext) before attempting it; do not start that work without the user's explicit go-ahead. **2026-08-15**: the app went live instead via **Cloudflare Tunnel** (zero code changes, no migration needed) at **https://serpl.efficientcorporates.in** — see `CLOUDFLARE_TUNNEL.md` for the full setup, an incident worth reading before touching DNS/tunnels again on this machine (multiple unrelated sites are hosted from it), and the "not yet done" persistence/reboot-survival gap.

## 1. What this project is

A budget preparation, approval, and monitoring web portal for **South Eastern Region Pipelines (SERPL)**, a division of **Indian Oil Corporation Limited (IOCL)**. It replaces an Excel-based process for preparing the annual Repair & Maintenance (R&M) budget and routing it through a 5-level approval chain.

Two budget figures are captured together at creation time:
- **RBE** (Revised Budget Estimate) for the **current** financial year — a mid-year revision of the already-approved budget, done around September.
- **BE** (Budget Estimate) for the **next** financial year — the fresh ask for the year ahead.

As of this project's start (2026-08-01), the current financial year is **2026-27**, so users are preparing **RBE 2026-27** and **BE 2027-28** simultaneously, in the same form, per line item.

## 2. Reference material

Everything the business gave us lives in `business_knowledge/` at the project root (kept as reference; not code):

| File | Contents |
|---|---|
| `Budget Management Portal-SERPL.docx` | SRS: org hierarchy, roles/responsibilities (their version — see discrepancy note below), 5 headline modules. |
| `Module B-Create tab.docx` | Exact Create Budget field list, field source/editability, dropdown values (Work Type, Recurring/One-Time). |
| `The Master Goal Sheet.pdf` | Handwritten notes — Reports filters/columns, and 3 more modules not in the SRS: Master Data, Audit Trail, Settings (period open/close), plus Authorization rules. |
| `image001 (1).png` | Dashboard mockup screenshots: Home, Create Budget (header + entry grid), Approve Budget (list + detail). Treat this as the concrete UI reference. |
| `Data for R&M Portal.xlsx` | Masters — see §4 below for sheet-by-sheet breakdown. |
| `AE BE ongoing.xlsx` | Sample SAP FMAC-style actuals extract (3 sheets: `AE 25-26`, `BE 26-27`, `ongoing AE 26-27 Q1`) — this is the *shape* Finance's periodic Excel upload will match. Columns: Company Code, G/L Account, Commitment Item, Commitment item name, Funds Center (=cost centre code), Funds center name, Fund (=line item code), Fund name, Val.type text, Amount type, Fiscal Year, Period, Amount. |
| `UXSAMPLE/SERPL_Budget_Portal_Demo.html` | **Added 2026-08-12.** A fully working, standalone React+Tailwind+Recharts demo (single bundled HTML file, ~625KB, `id="root"` + one big `<script>` — not hand-editable source, it's a build output) covering Login, Home/Dashboard, Create Budget, Approve Budget, Reports, and a combined Masters/Authorization screen, all using our actual seeded data (same employee names, cost centre codes). **This is now the authoritative visual/flow reference**, superseding `image001 (1).png` for layout — see §3 for the specific decisions made from it (palette, nav structure, field changes). To inspect it yourself: it's minified into one line per section, so grep/Read won't show readable markup — extract string literals instead (e.g. a small Node script matching `/["'][A-Za-z][A-Za-z0-9 ,.\-&/()#%:']{3,70}["']/g`) to recover UI labels, Tailwind classes, and sample data without executing it. |
| `UXSAMPLE/WhatsApp Image ....jpeg` | **Added 2026-08-12.** Screenshot of a *different* existing IndianOil internal tool ("IndianOil PDF Studio" under a "SPRINT" transformation project) — purple/orange gradient theme. **Decision: not used as the visual reference** (see §3) — it showed the real IndianOil logo in use, which is what prompted asking the user for the actual logo asset, but this portal's own theme follows the HTML demo instead, not this screenshot's colors. |
| `Indian-Oil-Logo.png` (project root, **not** in `business_knowledge/`) | **Added 2026-08-12.** The official IndianOil circular logo, provided by the user as a real usable asset (not a screenshot). Copied to `webapp/public/brand/indianoil-logo.png` for use in the app. Exact brand colors sampled from the pixels (see §3): orange `#EC6519`, navy `#312D73`. |

**Known discrepancy, resolved by the user**: the SRS docx and the dashboard mockup show only 4 approval levels (no "Station In-charge"), but the Excel `Roles` sheet and the user's own description both specify 5 levels including Station In-charge. **Decision: go with 5 levels** (see §5).

## 3. Decisions already made (do not re-ask these)

| Question | Decision |
|---|---|
| Approval levels | **5 levels**: Location User → Station In-charge → Base In-charge → TS Department → Finance Department |
| Authentication | Simple app-managed username/password for now. AD/SSO integration deferred (SRS mentions AD but IT details aren't available yet). |
| Actuals data ingestion (Actual Expenditure, Approved BE, Ongoing Expenditure) | Finance uploads Excel extracts shaped like `AE BE ongoing.xlsx`; system parses and stores them, aggregated at query time. |
| Tech stack | Prisma + PostgreSQL, single full-stack Next.js app (App Router, TypeScript). **Superseded 2026-08-12**: the scaffold (`create-next-app`, run before this decision was recorded) actually installed **Next.js 16 + React 19**, not the originally-decided Next.js 14. Rather than downgrade a working install, the user chose to keep Next 16 and use **NextAuth v5 beta (`next-auth@beta`, i.e. Auth.js v5)** instead of stable v4, since v4 doesn't reliably support React 19/Next 15+. Recharts for charts. `exceljs` for import/export. Local-disk storage for file attachments. |
| Approval return semantics | A "return" always goes exactly **one level back**, never straight to Draft (except the first return, Station→Location User, which *is* Draft). Only the Location User edits monetary figures; intermediate approvers can only add remarks and Approve/Return. This is a literal reading of the Excel `Roles` sheet responsibilities — confirm with the user if it ever seems wrong in practice. |
| Employee "Emp Contrl Off" field | This is descriptive master data only (their line manager per HR), **not** used for approval routing. Routing is role+scope based via the `UserAccess` table (see §6). |
| Line item FK on budget entries | **Decided 2026-08-12**: each transactional budget entry (entry-grid row) stores a required `lineItemId` FK to the master `BudgetLineItem` (line item code), not just a free-text description. Needed so Reports can match Proposed RBE/BE against Finance's actuals by line item code (the `Fund` column in `AE BE ongoing.xlsx`). See §6 naming note. |
| Visual style / theme | **Decided 2026-08-12, then reworked same day.** First pass took the UXSAMPLE demo's palette literally — teal-700 + stone + IBM Plex Sans, with the real IndianOil logo confined to the header/login/report letterheads only. **The user reviewed a screenshot and found this too weakly branded** ("I needed Indian Oil Branding all over. Even buttons, graphs, and all possible places... You have simply copy pasted the same colors as in the HTML file") and asked for a full rework — not just the logo, the actual color system. **Current palette** (defined as Tailwind v4 tokens in `webapp/src/app/globals.css`, sampled from the real logo asset): `brand-navy` `#312D73` (identity/emphasis — headers, active-state text, table totals, numeric emphasis) and `brand-orange` `#EC6519` (action — every primary button, active-tab underline, links, focus rings), each with `-dark`/`-light`/`-muted` variants. Applied everywhere, not just letterhead areas: buttons, active nav, focus rings, status pills (Active/Approved/Open → navy-tinted, not the demo's teal), table total rows, and both Recharts charts (`components/charts/`) — Actual Expenditure→navy, Approved BE→orange, Proposed RBE→amber (kept as the one non-brand hue, deliberately signaling "your own in-progress figure" vs. Finance-maintained navy/orange data), Ongoing/Proposed BE→muted navy/orange variants. IBM Plex Sans font kept from the demo. Amber (pending) and red (returned/error) kept as universal semantic colors, intentionally *not* rebranded, so they stay legible as status signals distinct from the navy/orange brand chrome. |
| Nav structure | **Decided 2026-08-12**, from the same demo: **6 top-level horizontal tabs**, not the original 8-item left sidebar: **Home / Create / Approve / Reports / Masters / Authorization**. Audit Trail and Settings are **not** separate top-level items — they're sub-tabs inside **Masters**, alongside Locations / Funds / Roles. So Masters' sub-tabs are: Locations, Funds, Roles, Audit Trail, Settings. Authorization stays its own separate top-level tab (already built as a dedicated module — see §9 step 8). |
| Approval "Reject" action | **Decided 2026-08-12**: the demo's sample data shows a `REJECTED` status, but the user confirmed **not** to add it — stick with the existing Approve/Return-only workflow exactly as originally decided (see the "Approval return semantics" row above and §6's state machine). The demo's REJECTED label is demo flavor only, not a real requirement. |
| File attachments — SharePoint vs local disk | **Decided 2026-08-12**: the demo's Create Budget form labels the attachment control "(SharePoint)", but the user confirmed to **keep local-disk storage** as originally decided — no SharePoint/Graph API integration. The UI label should just say "Attach supporting document", not imply SharePoint. |
| Justification field | **Decided 2026-08-12**: the demo shows a required "Justification" field (red asterisk) on each budget line item, separate from the existing `remarks` field. **This is a new, additional required field** — `remarks` stays as-is (optional free text); add a new required `justification` column to `BudgetEntry` (schema change needed — not yet migrated as of this decision being recorded, see §6/§9). |

## 4. Business master data (from `Data for R&M Portal.xlsx`)

**Org hierarchy**: SERPL → 2 Company Codes → 4 Pipelines → 5 Bases → 34 Operating Locations (Cost Centres).

- Company Code **9320**: Pipelines PHPL, PRRPL
- Company Code **9280**: Pipelines PHBPL, PSHPL
- **5 Bases**: Paradip, Bhubaneswar, Sambalpur, ERPL, Vijayawada
- **34 Cost Centres**, each with a code (e.g. `P5142`), a Pipeline, a Base, a Company Code, and a Location Name — full list in sheets `CostCentreList` / `Location Mapping` (these two sheets agree with each other; the separate `Location` sheet in the same workbook is stale/broken — every row in it says Base=Bhubaneswar regardless of actual location, and it has no Cost Centre code — **ignore it**, use `Location Mapping` as the authority).
- `CompanyMapping`/`CoCode`/`Base`/`Region` sheets are minor/incomplete helper sheets; `Region` sheet is useful (lists ERPL/NRPL/WRPL/SERPL/SRPL/PLHO — only SERPL matters here). The `Base` sheet has a `Base_Head`/`TS_Head`/`F_Head` column structure that's currently empty — this was probably an earlier idea for hardcoding approvers per base; **we're not using it** — approvers are assigned via the Authorization module instead (role + scope on `UserAccess`), which is more flexible and matches the mockup's "Authorization: admin decides role of employee" note.

**Budget Heads / Line Items** (`Fund Centre` sheet, 26 rows): 10 Budget Heads (called "DEPT" in the sheet) — Civil, Electrical, Mechanical, Lube Oil, S.B.M./Jetty, Telesupervisory, Telecommunication, Instrumentation, Miscellaneous, Mainline — each containing 1-6 numbered Line Items (called "FUND" in the sheet, a 4-digit code, e.g. `3123 = ME-PM-SBM-MAINT CON` under Mechanical... actually under S.B.M/Jetty per the sheet — see the sheet directly for the authoritative Head↔LineItem mapping, don't rely on this summary for exact pairings).

**Roles** (`Roles` sheet) — the 5 levels and their responsibilities, verbatim:
1. **Location User** — Prepare and save the budget for the assigned operating location. Save as Draft, edit until submitted, view status, modify if returned.
2. **Station In-charge** — Review budget from Location User, verify completeness/correctness, submit to Base In-charge, or return to Location User with remarks.
3. **Base In-charge** — Review budgets from Station In-charges across all locations under their Base, approve & forward to TS Dept, or return to Station In-charge with remarks.
4. **Technical Services (TS) Department – Regional Office** — Technical scrutiny across all 5 Bases, approve & forward to Finance, or return to Base In-charge with technical remarks.
5. **Finance Department – Regional Office** — Final financial scrutiny across all Company Codes/Pipelines/Bases/Locations, approve & finalize, or return to TS Dept.

**Employee master** (`Data base Emplyee` sheet, 311 rows): Employee No., Title, First/Last Name, Company Code, Personnel Area (e.g. "SERPL, Bhubaneswar"), Personnel Sub Area (department: Materials/HR/Operations/Maintenance/Finance/Construction/HSE/Vigilance/Info Systems/T&I/Techn. Services/Regional Head/Unit Head/Base Head/Stn Incharge), Employee Group/Subgroup, Designation (long + short text), Employee Category, **Emp Contrl Off** (reporting officer's employee number — descriptive only, see §3), Function, Functional Area, **Base**. No column maps an employee to a specific Operating Location — only to a Base. Per Module B doc + handwritten notes: default access is to *all* locations under the employee's Base; admin can grant additional cross-base/location access via Authorization.

The `User` sheet (Id, EmpId, Level, Region, Base, Location, Role) is **empty** — it's the template for what this portal's `User`/`UserAccess` tables need to hold; there is no existing user-role assignment data to import.

## 5. Create Budget — exact field spec (from `Module B-Create tab.docx` + mockup)

Header section (auto-populate where noted):
| Field | Source | Editable |
|---|---|---|
| Region | Default (SERPL) | No |
| Base | Employee's mapped Base | No |
| Operating Location | Employee's Base → dropdown of locations in that Base | Yes (within mapped Base only) |
| Company Code | Derived from selected Location | No |
| Pipeline | Derived from selected Location | No |
| Cost Centre | Derived from selected Location | No |
| Financial Year | User selection | Yes |
| Fund (Budget Head) | User selection → loads Budget Heads' Line Items | Yes |

Entry grid, one row per Line Item, columns: Item Description, RBE Material, RBE Service, RBE Total (computed), BE Material, BE Service, BE Total (computed), Work Type, Recurring/One-Time, Reference Taken From, **Justification (required — see §3, added 2026-08-12)**, Remarks (optional), file attachment (local disk, see §3), row actions (edit/delete). "Add Row" button. Actual Expenditure and Approved BE shown read-only at the top (Finance-maintained). Save Draft / Submit buttons.

- **Work Type** dropdown: Existing Work Order, Approved PR, Audit Recommendation, PMC ATR Point, New.
- **Recurring/One-Time** dropdown: Recurring, One-Time.

## 6. Data model (Prisma) — implemented in `webapp/prisma/schema.prisma`

**Status: implemented and migrated** (2026-08-12, migration `20260812104043_init`). The schema below is what's actually in the file, not just a target — check `webapp/prisma/schema.prisma` directly if this summary and the file ever disagree.

**Naming note**: the original plan named both the master line-item-code entity and the per-header entry-grid row `BudgetLineItem`. The implemented schema disambiguates: the master (line item codes, FK→BudgetHead) keeps the name **`BudgetLineItem`**; the transactional entry-grid row is called **`BudgetEntry`** instead. `BudgetEntry.lineItemId` is a required FK to `BudgetLineItem` (see the §3 decision row) — `itemDescription` on `BudgetEntry` is still stored (editable, defaults from the master row) but is no longer the only link between the two.

Masters: `Region`, `CompanyCode`, `Pipeline`, `Base`, `CostCentre` (=Operating Location), `BudgetHead` (10 rows), `BudgetLineItem` (FK→BudgetHead, 25 rows), `Employee` (311 rows, reference only).

Auth & access:
- `User` (employeeId FK→Employee, **nullable** so a bootstrap admin need not map to an Employee row; username, passwordHash, isActive)
- `UserAccess` (userId, role enum `LOCATION_USER | STATION_INCHARGE | BASE_INCHARGE | TS_DEPT | FINANCE_DEPT | ADMIN`, scopeType `LOCATION | BASE | REGION | ALL`, scopeId nullable) — one user can hold multiple role/scope grants. On user creation, auto-grant `LOCATION_USER` scoped to all cost centres under their Employee.Base (**not yet implemented** — this is app logic for the Auth module, §9 step 7, not part of the schema itself).

Transactional:
- `BudgetCycle` (financialYearRBE, financialYearBE, isOpen, opensAt, closesAt) — backs Settings "period open/closed".
- `BudgetHeader` (costCentreId, budgetHeadId, cycleId, createdByUserId, status enum `DRAFT | PENDING_STATION | PENDING_BASE | PENDING_TS | PENDING_FINANCE | APPROVED`, currentLevel int 0-5, timestamps; unique on `[costCentreId, budgetHeadId, cycleId]` — one header per location+fund+cycle)
- `BudgetEntry` (formerly listed as "BudgetLineItem" — see naming note above) (headerId, **lineItemId FK→BudgetLineItem**, itemDescription, rbeMaterial, rbeService, beMaterial, beService, workType enum, recurringOneTime enum, referenceTakenFrom, **justification (required, added 2026-08-12 — see §3)**, remarks (optional)) — totals computed, not stored. Monetary fields are `Decimal(18,2)`, not float.
- `BudgetAttachment` (entryId FK→BudgetEntry, fileName, storedPath, uploadedByUserId, uploadedAt)
- `ApprovalAction` (headerId, level, actionByUserId, action `APPROVE|RETURN`, remarks, actionAt) — the approval audit trail.
- `ActualsImportBatch` / `ActualsRow` (companyCode, commitmentItem, costCentreCode, lineItemCode, fiscalYear, period, amount, dataType `ACTUAL_EXPENDITURE | APPROVED_BE | ONGOING_EXPENDITURE`) — raw uploaded Finance data. Codes are stored as **plain strings, not FKs**, so an import never fails on a code that doesn't match our masters yet; matching/aggregation happens at query time, per the §3 decision.
- `AuditLog` (entityType, entityId, action, performedByUserId, timestamp, diff JSON) — general trail for master-data/admin changes.

**Prisma 7 driver-adapter note**: Prisma 7 (installed here) removed `datasource.url` from `schema.prisma` — connection config now lives in `webapp/prisma.config.ts` (used by Migrate/CLI) and the runtime `PrismaClient` needs a driver adapter passed to its constructor (see `webapp/src/lib/prisma.ts`, which uses `@prisma/adapter-pg`). If you're used to pre-7 Prisma, don't be surprised the schema file has no connection string.

### Workflow state machine (`lib/workflow.ts`)

```
DRAFT (Location User, editable)
  --submit-->            PENDING_STATION
PENDING_STATION (Station In-charge)
  --approve-->            PENDING_BASE
  --return-->             DRAFT
PENDING_BASE (Base In-charge)
  --approve-->            PENDING_TS
  --return-->             PENDING_STATION
PENDING_TS (TS Dept)
  --approve-->            PENDING_FINANCE
  --return-->             PENDING_BASE
PENDING_FINANCE (Finance Dept)
  --approve-->            APPROVED (final, read-only)
  --return-->             PENDING_TS
```

Every `BudgetHeader` query must be scoped server-side by the caller's `UserAccess` rows.

## 7. Modules → routes

**Superseded 2026-08-12** — nav restructured from an 8-item left sidebar to **6 top-level tabs** per the UXSAMPLE demo (see §3). **All 6 are now built** (§9 steps 8-13):

1. **Home/Dashboard** (`/`) — cascading filters (Region→Pipeline→Base→Location, + FY), KPI tiles (Actual Expenditure, Approved BE, Proposed RBE, Ongoing Expenditure, Proposed BE) + charts + company-code/fund breakup tables.
2. **Create Budget** (`/budgets/create`, `/budgets/[id]`) — per §5. Blocked if `BudgetCycle.isOpen` is false (no open cycles → picker form is replaced with a message).
3. **Approve Budget** (`/approvals`) — **deviates from the original route plan**: no separate `/approvals/[id]` — it's one master-detail page using `?item=<headerId>` for the selected budget, matching the UXSAMPLE demo's single-page layout. List filtered implicitly by "which statuses match a role you hold, within that role's scope" rather than explicit Level/Base/Status/FY selects. Detail view has Approve/Return + remarks (required for Return) + Excel export is not yet built for this list specifically (Reports' export covers the aggregate reporting use case).
4. **Reports** (`/reports`) — filters FY/Pipeline/Company Code/Cost Centre; LY Actual vs Approved BE vs Proposed RBE vs Proposed BE table; Excel export at `/reports/export`. **Strong IndianOil branding** (user's explicit ask 2026-08-12) — real logo + brand-color letterhead on both the on-screen page and the exported `.xlsx` file itself.
5. **Authorization** (`/admin/authorization`, admin-only) — its own top-level tab (not folded into Masters). Assign `UserAccess` rows.
6. **Masters** (`/admin/masters`, admin-only) — one top-level tab with **sub-tabs** (`?tab=`): Locations (CostCentre CRUD), Funds (BudgetHead/BudgetLineItem CRUD), Roles (read-only reference table — the 5 levels are fixed app logic, not business-editable data), Actuals Upload (the Finance Excel import screen), Audit Trail (browse `AuditLog`), and Settings (manage `BudgetCycle` open/close) — the latter two folded in here per §3, not separate top-level items as originally planned.

Full plan detail also saved at `C:\Users\GIGABYTE\.claude\plans\elegant-meandering-stroustrup.md` on the machine this was built on (not portable — treat this CLAUDE.md as authoritative, that path is local-machine-only).

## 8. Environment / infrastructure already set up

**This section describes TWO different machines** — the original `H:\`-drive machine (Google Drive virtual mount, where the blocker below was hit) and the `D:\`-drive machine this was resolved on (2026-08-12). If you're on yet another fresh machine, don't assume either machine's installed-software state carries over — check for yourself (see the pattern both blockers below followed: check first, don't assume `winget list`/`Program Files` reflects reality just because CLAUDE.md once said so on a different machine).

### Node.js/npm
**Not assumed anymore** — on the H: machine this was presumably already present (never explicitly verified); on the D: machine (2026-08-12) it turned out **not to be installed at all** (no `node`/`npm` on PATH, nothing in `Program Files` or `LocalAppData`). Installed via `winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements` — this succeeded without needing interactive UAC approval (unlike PostgreSQL, below). Resulted in Node v24.19.0 / npm 11.17.0. **If `npm`/`node` aren't on PATH, don't assume they're not installed** — a fresh PowerShell session may need `$env:Path` refreshed from the Machine+User scope after an install in the same session:
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

**npm's `allow-scripts` gate**: this npm version blocks native/build install scripts by default for security. After installing `bcrypt`, `sharp` (Next's image optimizer, transitive), `unrs-resolver` (transitive), and later `prisma`/`@prisma/engines`/`esbuild`, npm reports them as pending and refuses to run their install scripts until approved: `npx npm approve-scripts <pkg> [<pkg>...]`. Without this, `bcrypt` in particular fails at runtime (its native binding never gets built). All of the above were approved 2026-08-12 (see `webapp/package.json`'s `allowScripts` block, which records exactly which packages were approved — check it after any `npm install` that adds new native-module dependencies, and re-approve as needed).

### PostgreSQL
**H: machine (original)**: installed via `winget install --id PostgreSQL.PostgreSQL.17`, using the standard EDB installer, into `C:\Program Files\PostgreSQL\17`. The Windows service it installs (`postgresql-x64-17`) is NOT what we use — it has an unknown password and restarting it requires admin rights we didn't have. Instead, a **second, standalone PostgreSQL data directory** was created and is run manually via `pg_ctl` from that installed location.

**D: machine (2026-08-12) — installer blocked, portable binaries used instead**: PostgreSQL was not installed on this machine at all (`C:\Program Files\PostgreSQL` didn't exist), even though `.pgdata` (gitignored, but present because the whole folder was copied rather than freshly `git clone`d) already had real data files in it from the H: machine. The same `winget install --id PostgreSQL.PostgreSQL.17` (with or without `--silent`) **failed both times** with `0x800704c7 : The operation was canceled by the user` — this session runs without Administrator rights and without an interactive desktop session able to answer the UAC elevation prompt the EDB installer requires, so Windows auto-cancels the elevation request. **Do not keep retrying the winget/EDB installer in a non-interactive session — it will not succeed without an interactive admin approval.**

Resolution used instead: EDB also publishes a **no-installer, binaries-only zip** that needs no admin/UAC at all:
```powershell
Invoke-WebRequest -Uri "https://get.enterprisedb.com/postgresql/postgresql-17.10-2-windows-x64-binaries.zip" -OutFile "C:\PGPortable\pg17.zip"
Expand-Archive -Path "C:\PGPortable\pg17.zip" -DestinationPath "C:\PGPortable" -Force
```
This extracts to `C:\PGPortable\pgsql\bin\` (contains `pg_ctl.exe`, `initdb.exe`, `psql.exe`, etc.) and works directly against the existing `.pgdata` directory — same major version (17), so no version-mismatch issue. **If you hit the same UAC blocker on yet another machine, use this same portable-zip path rather than re-attempting the installer** — check the exact current version first (`winget show --id PostgreSQL.PostgreSQL.17` or similar) so the zip URL's version segment matches, since EDB's zip URLs are version-pinned.

**Unified operational detail (applies regardless of which binaries you use — just swap the bin path)**:
- Data dir: `<project root>/.pgdata` (gitignored — machine-specific binary data)
- Start command: `& "<pg-bin-dir>\pg_ctl.exe" -D "<project root>\.pgdata" -l "<project root>\.pgdata\server.log" -o "-p 5433" start`
  (`<pg-bin-dir>` = `C:\Program Files\PostgreSQL\17\bin` if installed normally, or `C:\PGPortable\pgsql\bin` if using the portable zip — **check which one actually exists on the current machine before assuming**)
- Stop command: same but `stop` instead of `start`
- Port: **5433** (not the default 5432, to avoid clashing with the Windows service if it's ever running)
- Superuser: `postgres` / password: `postgres`
- App database created: `ioclserpl_budget`
- Connection string: `postgresql://postgres:postgres@127.0.0.1:5433/ioclserpl_budget` (in `webapp/.env` as `DATABASE_URL`)

**Important — this is not a persistent service**: it does NOT survive a reboot/logoff and must be started manually every session with the start command above before `prisma migrate`/`npm run dev`/etc. will work. Check first with:
`& "<pg-bin-dir>\pg_ctl.exe" -D "<project root>\.pgdata" status`

**Known quirk observed once (H: machine)**: the server can silently die between sessions with `could not reserve shared memory region ... error code 487` in `.pgdata\server.log` (a transient Windows ASLR/shared-memory issue), while `Get-Process postgres` still shows processes running — those may be an unrelated Windows-service instance (port 5432, session 0, `Access is denied` if you try to kill them — ignore them, they're not ours). Don't be fooled by that into thinking the DB is up. Verify with `psql ... -c "SELECT 1"` (or equivalent) rather than trusting the process list, and just re-run the start command if it's down — it's idempotent enough to just retry.

**On a fresh machine/clone**: if `.pgdata` doesn't exist (it's gitignored), re-run `initdb` and the create-database step, or just point `DATABASE_URL` at any Postgres instance you have — the schema/seed are what matter, not this specific instance.

### Next.js scaffold + npm install
Created via `create-next-app` in `webapp/` (TypeScript, App Router, Tailwind, ESLint, `src/` dir, import alias `@/*`). Actual installed base versions: **Next.js 16.2.12, React 19.2.4** (not Next 14 as originally decided in §3 — see that section's superseded note).

**H: blocker (permanent, unresolved on that machine)**: `npm install` fails repeatedly on `H:\`, a Google Drive "Other Computers" virtual/network mount — `EBUSY`, then `TAR_ENTRY_ERROR`/`EBADF` on retry. Reconfirmed twice (2026-08-11). This is a reliable, repeatable failure of this drive type. **Do not retry npm install on H:.**

**D: machine (2026-08-12) — blocker resolved**: repo copied to local disk `D:\EffCorp_Products\IOCLSERPLBudget\IOCLSERPLBudget\`. `npm install` succeeded cleanly (356 packages). All project dependencies since added: `@prisma/client`, `@prisma/adapter-pg`, `pg`, `next-auth@beta` (v5, see §3), `bcrypt`, `exceljs`, `recharts` (prod); `prisma`, `tsx`, `dotenv`, `@types/bcrypt`, `@types/pg` (dev). `npm run build` verified clean after each addition. **§9 build order step 4 is done as of this update** — if you're picking this up fresh, don't redo it; check `webapp/package.json` first.

If you land on a machine where the repo is still only on `H:\`, the blocker above still applies — clone/copy to a local disk first, same as this session did.

### Backup / zip utility
`zip_project.py`, at `H:\Other computers\Office_Desktop\EffCorp_Products\IOCLSERPLBudget\` (**one level above** the project root, i.e. a sibling of this `IOCLSERPLBudget/` folder, not inside it / not in git) — zips this whole project folder into a timestamped `IOCLSERPLBudget_backup_<timestamp>.zip` next to itself. Excludes `.pgdata`, `node_modules`, `.next` (machine-specific/regenerable, not source). Re-run anytime; each run makes a new timestamped file rather than overwriting the last one. Not part of the automated build — a manual convenience the user asked for.

### Git / GitHub
Git repo init and the GitHub private repo (name: `IOCLSERPLBudget`, matching the root folder) are being handled by the user directly, not by the assistant. As of 2026-08-15: remote `origin` is configured (`https://github.com/EFFICIENTCORPORATES/IOCLSERPLBudget.git`); `main` still has just the one original commit (`6113c25`); the entire application build (everything in §9) plus branding rework plus the Cloudflare Tunnel/Workers docs was committed at the user's request on a separate branch, **`build/initial-implementation`**, pushed to `origin` — not yet merged to `main`, that's the user's call. If you're continuing this project: check `git log`/`git status`/`git branch -a`/`git remote -v` yourself to see current state before assuming anything (this note will go stale the moment anyone commits or merges again).

## 9. Build order / status

1. ~~Review all business_knowledge files, get user decisions~~ — **done**.
2. ~~Set up local PostgreSQL~~ — **done** (see §8; redone on the D: machine 2026-08-12 via portable binaries since the installer was blocked there).
3. ~~Scaffold Next.js project~~ — **done**. Repo now lives on local disk `D:\...`, `npm install` completed 2026-08-12 (see §8).
4. ~~Add project dependencies to `package.json`~~ — **done** 2026-08-12: `@prisma/client`, `@prisma/adapter-pg`, `pg`, `next-auth@beta`, `bcrypt`, `exceljs`, `recharts` + dev tooling (`prisma`, `tsx`, `dotenv`, type packages). See §8.
5. ~~Prisma schema per §6~~ — **done** 2026-08-12. `webapp/prisma/schema.prisma` written, `webapp/prisma.config.ts` added (Prisma 7 driver-adapter config, see §6), migration `20260812104043_init` applied against the local Postgres instance.
6. ~~Seed script~~ — **done** 2026-08-12. `webapp/prisma/seed.ts` parses `business_knowledge/Data for R&M Portal.xlsx` via `exceljs` (sheets used: `Location Mapping` for CompanyCode/Pipeline/Base/CostCentre — **not** `CostCentreList` or `Location`, per §4; `Fund Centre` for BudgetHead/BudgetLineItem; `Data base Emplyee` for Employee). Run via `npx prisma db seed` (wired up in `prisma.config.ts`'s `migrations.seed`). **Row counts verified exactly**: 34 cost centres, 10 budget heads, 25 line items, 311 employees — script itself asserts and warns on any mismatch, safe to re-run (idempotent upserts on natural keys).
7. ~~Auth (NextAuth credentials login) + RBAC helper (`getUserAccess(userId)`) + base layout/nav~~ — **done** 2026-08-12, verified end-to-end (unauthenticated → 307 redirect to `/login` → CSRF-protected credentials POST → session cookie → protected route renders with correct user/role). Key files:
   - `webapp/src/auth.ts` — NextAuth v5 config (Credentials provider, JWT session, `callbacks.authorized` gate).
   - `webapp/src/proxy.ts` — route protection. Named `proxy.ts` not `middleware.ts`: Next 16 deprecated the `middleware` file convention in favor of `proxy` (same `auth` export, just renamed) — see https://nextjs.org/docs/messages/middleware-to-proxy. If you're used to `middleware.ts`, that's why it's missing.
   - `webapp/src/lib/rbac.ts` — `getUserAccess(userId)`, `getCurrentUser()`, `getAccessibleCostCentreIds(access)` (resolves ALL/REGION/BASE/LOCATION scope to concrete CostCentre ids — every `BudgetHeader` query in later steps should go through this), `hasRole()`.
   - `webapp/src/app/(app)/layout.tsx` + `Topbar.tsx`/`TabNav.tsx` — the shell. **Superseded 2026-08-12**: originally a left sidebar matching `image001 (1).png`; rebuilt to match the UXSAMPLE demo instead — a top header (logo + title + user/sign-out) with a 6-tab row below it (Home/Create/Approve/Reports/Masters/Authorization), IBM Plex Sans. Color theme reworked same day from the demo's teal/stone to real IndianOil navy/orange brand tokens — see §3's "Visual style / theme" (current) and "Nav structure" decisions. `Sidebar.tsx` no longer exists.
   - `webapp/src/app/login/page.tsx` — credentials login form.
   - **Bootstrap admin**: no Authorization module exists yet (see step 8), so nobody could log in without a seeded account. Added `webapp/prisma/bootstrap-admin.ts` (run via `npm run db:bootstrap-admin`) — creates a single `ADMIN`/`ALL`-scope user if one doesn't already exist yet, prints the generated password once (not re-printed on re-run, and re-running never resets an existing password — delete the row yourself to reset). **A bootstrap admin already exists in the local DB as of 2026-08-12** (username `admin`) — don't re-run expecting a fresh account; if you don't have the password, either ask the user for it or delete the `User` row and re-run.
8. ~~Authorization module~~ — **done** 2026-08-12. `webapp/src/app/(app)/admin/authorization/`:
   - `page.tsx` — lists all Users with their access grants (role @ resolved scope name); a "Create login for an employee" form (native `<select>` over the 311 Employees, not a search-as-you-type widget — fine for now, revisit if Master Data step needs something fancier); per-user "Add grant" form (role + scopeType + dependent scope select) and per-grant Revoke; Activate/Deactivate toggle.
   - `actions.ts` — Server Actions: `createUserForEmployee` (checks employee doesn't already have a User, username uniqueness, bcrypt-hashes the admin-supplied initial password, auto-grants `LOCATION_USER`/`BASE`-scoped-to-employee's-Base per §4/§6), `addAccessGrant`, `revokeAccessGrant`, `toggleUserActive` — all write an `AuditLog` row and are guarded by a `requireAdmin()` check independent of the route guard below.
   - `webapp/src/app/(app)/admin/layout.tsx` — server-side redirect-to-`/` for non-admins on every `/admin/*` route (the sidebar hiding admin links from non-admins is cosmetic only; this is the actual enforcement).
   - **Verified**: `npm run build` clean; DB-mutation logic (create user + auto-grant, add grant, deactivate, revoke, audit log) exercised directly against the real seeded DB via a throwaway script and confirmed correct, then cleaned up. The two forms that use React 19 `useActionState` (create-login, add-grant) need JS/hydration — not verified via raw HTTP since no headless-browser tool was available in this session; if that ever matters, drive them with a real browser once, but the underlying Server Actions they call are the same DB-verified functions above.
9. ~~Create Budget module (Draft/Submit)~~ — **done** 2026-08-12. `webapp/src/app/(app)/budgets/`:
   - `create/page.tsx` + `create/actions.ts` — a picker (Location scoped to the user's `LOCATION_USER` grants / Fund / Financial Year → "Load") that finds-or-creates the `BudgetHeader` for that `[costCentreId, budgetHeadId, cycleId]` triple, then redirects to `/budgets/[id]`; below it, a list of the user's own headers with status + Continue/View links.
   - `[id]/page.tsx` — header info (Region/Base/Location/CompanyCode/Pipeline/CostCentre/FY/Fund, all derived/read-only) + KPI tiles (Actual/Approved BE show "—" until Actuals are imported, step 12; Proposed RBE/BE computed live from entries) + `EntryGrid`.
   - `[id]/EntryGrid.tsx` — client component, one card per line item (Line Item Code select scoped to the header's Fund → auto-fills Item Description, editable; RBE/BE Material+Service with live computed totals; Work Type; Recurring/One-Time; Reference Taken From; **Justification, required**, red asterisk per §3; Remarks, optional; per-row Attachments, see step 15) with Add/Remove Row, Save Draft (bulk upsert via `[id]/actions.ts`'s `saveDraftEntries`), and Submit (`submitBudget` — validates ≥1 entry and every entry has non-blank Justification, then transitions `DRAFT → PENDING_STATION` via `lib/workflow.ts`).
   - Editable only when `status === DRAFT` **and** the viewer holds `LOCATION_USER` access to that Cost Centre (checked both client-render-gate and server-side in every action) — matches the "only Location User edits monetary figures" rule in §3.
   - **Verified**: DB-level workflow logic (create → entries → submit) exercised directly, `npm run build` clean, `/budgets/create` and `/budgets/[id]` both HTTP-200 when logged in.
10. ~~Approval workflow engine + Approve Budget module, all 5 levels~~ — **done** 2026-08-12.
    - `webapp/src/lib/workflow.ts` — `submitForApproval`/`approve`/`returnOneLevel` implementing exactly the §6 state machine (no Reject action — confirmed with user, see §3), plus `STATUS_LEVEL`, `ACTOR_ROLE_FOR_STATUS`, `PENDING_STATUS_FOR_ROLE`, `STATUS_LABELS` lookup tables.
    - `webapp/src/app/(app)/approvals/` — a master-detail layout (`?item=<headerId>` query param selects the detail pane, not a separate `/approvals/[id]` route — a deliberate deviation from the original §7 route list to match the UXSAMPLE demo's single-page pattern) listing headers "Pending at your level" (computed from which `PENDING_STATUS_FOR_ROLE` status(es) match roles the viewer holds, scoped to that role's `getAccessibleCostCentreIds`), a read-only entry list (approvers never edit monetary figures — §3), Approval History timeline (`ApprovalAction` rows), and a Remarks + Approve/Return form (`actions.ts`'s `actOnHeader`, remarks required only for Return).
    - **Verified end-to-end against the real DB**: a full walk DRAFT→submit→4×approve→APPROVED, and separately a return-goes-back-exactly-one-level check (`PENDING_BASE` return → `PENDING_STATION`, not `DRAFT`) plus confirmation that Station's return is the one exception that *does* land on `DRAFT` — all matched `lib/workflow.ts` exactly.
11. ~~Home Dashboard, cascading filters + charts~~ — **done** 2026-08-12. `webapp/src/app/(app)/page.tsx` — Region (fixed SERPL) → Pipeline → Base → Location cascading `<select>`s + Financial Year, all computed server-side from `searchParams` and scoped to the viewer's overall accessible cost centres (union across *all* their access grants, not just `LOCATION_USER` — Home is a broader overview than Create Budget); 5 KPI tiles; two Recharts charts (`components/charts/BudgetOverviewChart.tsx` single-hue horizontal bar, `BudgetHeadComparisonChart.tsx` 3-series grouped bar using the dataviz-skill's pre-validated first-three categorical slots — blue/orange/aqua); Budget-Head-wise summary table; Company-Code breakup table with a red-highlighted Approved-BE-minus-Proposed-RBE difference column, matching `image001 (1).png` panel 1. "Proposed RBE/BE" sums entries from non-`DRAFT` headers only (a submitted-or-further budget counts as "proposed"; an untouched Draft doesn't) — this is this session's own reasonable interpretation, not an explicit spec line, revisit if it ever looks wrong in practice.
12. ~~Actuals Excel import (Finance) + Reports module + Excel export~~ — **done** 2026-08-12.
    - `webapp/src/lib/actuals-import.ts` — `parseActualsWorkbook()` parses an `AE BE ongoing.xlsx`-shaped workbook. **Classifies by sheet-NAME prefix** (`ongoing…`→`ONGOING_EXPENDITURE`, `AE…`→`ACTUAL_EXPENDITURE`, `BE…`→`APPROVED_BE`), not by the row's own embedded "Fiscal Year" column — verified that column is inconsistent/unreliable in the real sample file, so sheet-level classification is authoritative everywhere (Home, Reports) rather than trying to parse per-row fiscal years. Column layout is 1-indexed and documented in the file's own header comment.
    - `webapp/src/app/(app)/admin/masters/actuals-actions.ts` — `importActualsFile` Server Action (admin-only), chunks `createMany` in batches of 1000.
    - **Verified against the real `business_knowledge/AE BE ongoing.xlsx`**: parser extracted exactly 7823 rows (3891 AE + 3009 BE + 923 ongoing — matches the sheets' own row counts exactly), sample-imported, and confirmed Reports picks up real non-zero figures for a real cost centre (P5142) after import.
    - `webapp/src/lib/reports.ts` — `getReportData()`, the one aggregation implementation shared by both the on-screen page and the Excel export (so they can't drift apart). Per-Cost-Centre rows: LY Actual / Approved BE / Proposed RBE / Proposed BE.
    - `webapp/src/app/(app)/reports/page.tsx` — Pipeline/Company Code/Cost Centre/FY filters + **prominent IndianOil letterhead branding** (real logo, brand colors `#312D73` navy / `#EC6519` orange sampled from the actual logo asset — see §3/§8) — the user's explicit "very good branding of Indian Oil through the reports" ask, 2026-08-12.
    - `webapp/src/app/(app)/reports/export/route.ts` — GET route, streams a real `.xlsx` (via `exceljs`) with the same letterhead **including the actual embedded logo image**, not just on-screen. **Verified**: downloaded and re-parsed the exported file with `exceljs` to confirm it's well-formed, contains the branding text and 1 embedded image, and the correct header row.
13. ~~Master Data CRUD screens~~ — **done** 2026-08-12, as the **Masters** module (folded Locations/Funds/Roles + Audit Trail + Settings into one nav tab with sub-tabs, per §3/§7 — not 3-4 separate top-level pages as the route table originally said). `webapp/src/app/(app)/admin/masters/`:
    - `page.tsx` + `MasterTabs.tsx` — `?tab=locations|funds|roles|actuals|audit|settings` sub-tab switcher.
    - `LocationsTab.tsx` / `CreateLocationForm.tsx` — CostCentre CRUD (create + delete; delete blocked by Postgres FK constraint if a `BudgetHeader` references it — caught and shown as a friendly message via `friendlyDbError()` in `actions.ts`, verified directly against the DB).
    - `FundsTab.tsx` / `CreateFundForms.tsx` — BudgetHead + BudgetLineItem CRUD, same FK-guard pattern.
    - `RolesTab.tsx` — static read-only table (the 5 levels are fixed app logic per §4, not database-editable master data — no `actions.ts` entry for this tab).
    - `ActualsTab.tsx` / `ActualsUploadForm.tsx` — houses the step-12 upload form + a history table of `ActualsImportBatch` rows.
    - `AuditTrailTab.tsx` — last 100 `AuditLog` rows (every mutating action across every module in this session writes one).
    - `SettingsTab.tsx` / `CreateCycleForm.tsx` — `BudgetCycle` open/close toggle + create-new-cycle form.
    - `webapp/src/app/(app)/admin/layout.tsx` (pre-existing from step 8) already gates all of `/admin/*` including this — no separate guard needed.
14. Folded into step 13 above (Audit Trail + Settings are Masters sub-tabs, not separate top-level pages) — **done**.
15. ~~File attachments on budget entries~~ — **done** 2026-08-12. Local disk per §3 (not SharePoint — see §3's explicit decision), stored **outside** `public/` at `webapp/.data/attachments/<entryId>/<timestamp>-<filename>` (gitignored — machine-specific runtime data) so files are only reachable through an access-controlled route, never served statically.
    - `webapp/src/lib/attachments.ts` — `saveAttachmentFile`/`deleteAttachmentFile`/`resolveStoredPath` (the latter refuses to resolve outside the attachments root — a path-traversal guard, verified directly).
    - `webapp/src/app/(app)/budgets/[id]/actions.ts`'s `uploadAttachment`/`deleteAttachment` — same DRAFT + `LOCATION_USER`-access gate as the rest of Create Budget; 10MB size cap.
    - `webapp/src/app/api/attachments/[id]/route.ts` — GET download, gated by *any* role covering the attachment's parent header's Cost Centre (viewing attachments isn't Location-User-only the way uploading is — an approver needs to see what was attached).
    - `AttachmentUploader.tsx` — embedded per-row in `EntryGrid`; only shown for rows that already have a real persisted id (a brand-new unsaved row shows "Save draft first to attach files" instead, since `BudgetAttachment.entryId` needs a real FK target). Also surfaced read-only (download links only) in the Approve Budget detail view.
    - **Verified end-to-end against real disk + DB**: save → read-back byte-for-byte match → path-traversal attempt correctly blocked → delete → file confirmed gone from disk.

## 10. Verification approach (once code exists)

- `npm run build` after each phase as the primary automated check (no test suite exists yet).
- After seeding: assert row counts (34 / 10 / 25 / 311).
- Manual end-to-end walkthrough: log in as a seeded Location User → create budget → submit → log in as Station In-charge → approve → Base In-charge → TS → Finance → confirm status becomes `APPROVED` and read-only; confirm a `return` at any level goes back exactly one level and becomes editable again for that owner.
- Upload an `AE BE ongoing.xlsx`-shaped file as Finance → confirm Home dashboard KPI tiles update for the matching cost centre/fund.
- Confirm scoping: a Base In-charge for Paradip cannot see budgets from Vijayawada; TS/Finance can see all Bases.
