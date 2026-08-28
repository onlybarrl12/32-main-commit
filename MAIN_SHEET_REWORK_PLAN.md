# MAIN SHEET Rework — Plan & Progress

**Purpose of this file**: this is the working plan (and live progress tracker) for the 2026-08-21 rework of Create Budget / Approve Budget / Masters against the newly-added `MAIN SHEET` in `business_knowledge/Data for R&M Portal.xlsx`. It exists so this work survives a context reset — read this before continuing the rework, and update the checkboxes as you go. Once the rework is fully verified end-to-end, fold the outcome into `CLAUDE.md` (§3/§6/§7/§9) as the single source of truth and this file can be archived/deleted.

**Status as of last update (2026-08-25): the RBE/BE fallback removal AND the full Broad PNL Qty/Rate/UOM rework are implemented, migrated, seeded, built, and DB/HTTP-verified — see the two 2026-08-25 addenda below for two further batches of changes on top of that: Addendum 1 (Create Budget UX fixes, bulk Excel upload for entries, bulk login creation + password recovery, forgot-password — Power/Chemical Rate handling from this addendum was superseded same day) and Addendum 2 (a crash fix, Power's Rate reverted to user-editable like Qty — only Chemical stays admin-maintained, totals/KPI display fixes). Migration `20260824000000_main_sheet_rework_and_broad_pnl` plus `20260825000000_password_recovery_and_reset_requests` are both applied to the real DB. CLAUDE.md is NOT yet updated — still describes the pre-2026-08-21 schema/workflow; do a full pass once the remaining items in "What's verified so far vs. not" below are closed out.**

---

## Addendum (2026-08-25): Power=Chemical correction, Create Budget UX, bulk upload, password recovery

All implemented, migrated (`20260825000000_password_recovery_and_reset_requests` — additive only, no data wipe needed), built, and verified (DB-level script + live HTTP smoke test with a temporary admin account, cleaned up afterward). Hosted live.

**1. Power corrected to match Chemical exactly — SUPERSEDED same day, see "Addendum 2" below.** The paragraph below was true for a few hours on 2026-08-25 but is no longer the live behavior; kept for history rather than deleted.

~~The user caught that Power's Rate had been mis-specced as user-typed back on 2026-08-24; it's now admin-maintained (UOM + per-FY Rate) identically to Chemical, Location User enters only Qty for both. Every `broadPnlHead === "CHEMICAL"`-only check across the codebase (`EntryGrid.tsx`, both actions.ts files, `workflow.ts`'s freeze function — renamed `freezeChemicalRatesOnApproval` → `freezeQtyRateOnApproval`, both page.tsx files, `reports.ts`, the Rates & UOM admin tab) was broadened to `isQtyRateHead()` (POWER or CHEMICAL). The Rates & UOM tab's Power-specific "not admin-maintained" messaging and its per-row `isChemical` prop were removed — the form is now identical for both.~~

**2. Create Budget bug fix — actuals were zero until a Sub Head row existed.** Root cause: the Sub Head summary table only ever iterated Sub Heads that already had an entry row. Fixed two ways: (a) a new always-visible "Reference: Actuals for this Cost Centre" panel at the top of the entry screen, built from data already fetched (no new query), shown the instant the screen loads — independent of which Budget Heads have been added yet; (b) each added Budget Head's own summary table now iterates *every* Sub Head under that head, not just touched ones.

**3. Indian number formatting + Lakhs in Create Budget.** New `src/lib/format.ts` (`formatINR`, `formatRupees`, `formatLakh` — en-IN grouping, exactly 2 decimals). Every *displayed* figure in Create Budget/Approve Budget (KPI tiles, summary tables, row/grand totals) now shows in ₹ Lakh with Indian comma grouping, matching Reports/Home (which were already like this — Create Budget was the one screen still showing raw absolute amounts). Input fields (Material/Service/Qty/Rate) are untouched — still plain absolute rupees, 2 decimal places, exactly as the user required. The Rate read-only field uses `formatINR` (absolute, Indian-grouped) rather than Lakh, since a per-unit rate in Lakhs would be meaningless.

**4. Collapse All / Expand All** — per-Budget-Head-card collapse state in `EntryGrid.tsx`; a collapsed card shows just its name and RBE/BE Lakh totals.

**5. Bulk Excel upload for Create Budget entries** (`src/lib/budget-entries-upload.ts`, `upload-actions.ts`, `ExcelUploadButton.tsx`, template at `/api/templates/budget-entries`). README-first workbook, 3 data sheets (R & M, Power & Fuel, Chemical — Power & Fuel and Chemical ended up with identical Qty-only column layouts once Power was corrected to match Chemical, per the user's confirmed fix; kept as separate sheets per the explicit "make 3 sheets" ask). Budget Head/Sub Head/Work Type/Recurring dropdowns are backed by a hidden `Lists` sheet (range references, not inline lists, to dodge Excel's ~255-char inline-list limit) with `errorStyle: "stop"` — Excel itself rejects anything not in the list. Sub Head dropdowns are **not** cascaded to the chosen Head (a mismatch is caught server-side instead, with an exact sheet+row error) — a deliberate simplification over building cascading dropdowns, noted here rather than silently done. Validation is 100% deterministic (exceljs + plain JS, zero AI involved anywhere in this path, per the user's explicit requirement) and all-or-nothing: any failing row blocks the whole batch, every failure reported with its exact sheet name and row number. On success, parsed rows are appended to the in-memory grid (not persisted directly) for review before Save/Submit, same as a hand-added row. **A real bug was caught and fixed during verification**: the template's "UOM (auto)" VLOOKUP formula column made every unfilled template row look non-blank to the parser (a formula cell with no cached result stringified to `"[object Object]"`), so every empty row in Power & Fuel/Chemical was wrongly flagged as an error — fixed in `cellText()`'s formula-cell handling, verified with a script that fills a real template, re-parses it, and checks both a rejection path and a success path.

**6. Review + PDF** (`ReviewPanel.tsx`) — a "Review" button (disabled until at least one row exists) shows a Broad-PNL-wise → Budget-Head-wise → Sub-Head-wise summary of whatever's currently in the grid (saved or not), in ₹ Lakh. "Download PDF" opens a clean print-only window and calls the browser's print dialog — the user Save-as-PDFs from there, per the user's explicit choice over adding a PDF-generation dependency.

**7. Bulk login creation + admin password recovery + forgot-password.** New schema: `User.passwordEncrypted` (AES-256-GCM via `src/lib/password-crypto.ts`, key in `.env`'s `PASSWORD_RECOVERY_KEY`) and `PasswordResetRequest`. Bulk create (`BulkCreateLoginsForm.tsx`, `bulkCreateLogins` action, template at `/api/templates/bulk-create-logins` pre-filled with employees lacking a login) auto-generates both username (from employee name, deduped) and a random password for each row, shown once inline and always retrievable afterward. "Download current passwords" (`/api/admin/passwords/download`, admin-only) decrypts and lists every user's current password — an **explicit, deliberate security tradeoff the user chose** over a safer one-time-reveal-only design (flagged during the conversation, confirmed as the wanted behavior); accounts predating this feature show a blank password with an explanatory note since bcrypt's hash alone can never recover the original. Forgot Password (login page → `requestPasswordReset`, public/unauthenticated, generic response regardless of whether the username exists) creates a `PasswordResetRequest`; admin sees a 🔔 badge count in the Topbar (fetched in `layout.tsx`, admin-only) linking to `/admin/password-resets`, where a "Reset" button generates and reveals a new password immediately and marks the request resolved.

---

## Addendum 2 (2026-08-25, same day): Power reverted to user-editable; crash + totals fixes

The user reported (with a screenshot) that saving/submitting a budget crashed with a generic Next.js "This page couldn't load" error, that the "0" default in numeric fields had to be manually deleted before typing, that Power's Rate should actually be user-editable after all (**reversing Addendum 1 item 1 above** — only Chemical's Rate stays admin-maintained, per kg), and that KPI tiles / table totals were showing zero. All fixed, rebuilt, and verified live (including a seed-and-cleanup script proving the arithmetic end-to-end on the user's own reported budget header).

1. **Root cause of the crash**: `upload-actions.ts` (a `"use server"` file, part of Addendum 1 item 5's Excel upload) had `export type { UploadResult };` — Next's server-action compiler doesn't reliably erase a type-only re-export from a `"use server"` module, leaving a runtime `ReferenceError: UploadResult is not defined` that crashed *every* SSR render of the budget detail page (not just after Save — the whole route was broken the moment `EntryGrid` started importing `ExcelUploadButton`). Fixed by deleting the dead re-export; nothing else imported the type through that file.
2. **Power reverted to user-editable Rate**, exactly like its Qty — undoing Addendum 1 item 1. Added `isAdminRateHead()` (Chemical only) and a shared `resolveRate()` helper to `src/lib/entry-amount.ts` so every call site (`EntryGrid.tsx`, `budgets/[id]/actions.ts` and `page.tsx`, `approvals/page.tsx`, Home `page.tsx`, `reports.ts`, `workflow.ts`'s freeze-on-approval) resolves the Rate identically and can't drift apart again. `RateUomForm`/`RatesUomTab` now only render Rate inputs for Chemical Sub Heads (Power still gets a UOM field, no Rate field, since there's nothing for admin to set).
3. **"0" not clearing automatically**: added `onFocus={(e) => e.target.select()}` to every numeric entry field (`NumberField` in `EntryGrid.tsx`) — the first keystroke now replaces the "0" instead of requiring a manual delete first.
4. **Totals not showing**: each Budget Head's Sub Head summary table had no Total row (added a `<tfoot>` row); the grand "Total Proposed RBE/BE" line was gated behind `editable` so approvers/read-only viewers never saw it at all (moved it outside that gate — only the Save/Submit/Review buttons stay editable-gated).
5. **KPI tiles showing zero**: this was a direct symptom of #1 — the reported budget header genuinely had 0 persisted entries (nothing had ever successfully saved through the crash). Verified after the fix by seeding a real Power row + Chemical row on that exact header, confirming KPI tiles / per-head Total rows / grand total all agreed with hand-calculated Qty×Rate, then removing the test data again.

**Not done / explicitly simplified, noted rather than silently skipped:**
- Budget Sub Head dropdowns in the upload template are not cascaded to the chosen Budget Head (see item 5).
- No true one-click PDF file — print-dialog-based per the user's own choice (see item 6).
- Passwords are recoverable indefinitely, not one-time-reveal — per the user's own explicit choice (see item 7).
- CLAUDE.md itself still not updated.

**2026-08-24 — both changes below are now implemented in code, not just planned:**
- Decision 4 (Proposed RBE/BE fallback to Approved BE when blank) is reversed and **implemented**: `EntryGrid.tsx` shows exactly what was entered (blank/0, no substitution), the `(P)`/`(A)` tagging is gone, and `saveDraftEntries` treats blank/zero/negative as zero via `src/lib/entry-amount.ts`'s `numOrZero` — never a fallback.
- The Broad PNL Qty/Rate/UOM rework (originally specced as an addendum below) is **implemented**: schema (`SubHeadUom`, `SubHeadRate`, `BudgetEntry.rbeQty/rbeRate/beQty/beRate`), a new Masters "Rates & UOM" admin tab, `EntryGrid.tsx` branching Material/Service (R&M) vs Qty/Rate (Power/Chemical), server-side Chemical-rate re-resolution (never trusts the client), and the live-until-approval/frozen-at-approval Rate behavior (`lib/workflow.ts`'s `freezeChemicalRatesOnApproval`, wired into `approvals/actions.ts`'s Finance-approve path). See the addendum section below for the full design as originally specced — checklist items 13-18 there are now done, not "NOT started".

---

## Context — why this rework

The originally-built app (see `CLAUDE.md`) implemented Create Budget/Approve Budget against an earlier reading of the business rules: one `BudgetHeader` per Cost Centre **+ Budget Head** + cycle, a one-level-back return chain, and a single combined AE/BE/ongoing actuals workbook. The user supplied an updated Excel workbook containing a new `MAIN SHEET` (not present when `CLAUDE.md` was last written) that changes core rules:

- **One Budget Creation Proposal per Cost Centre per FY cycle**, holding *multiple* Fund/Budget Heads and Budget Sub Heads (previously: one header per Budget Head).
- **Approval matrix** (`MAIN SHEET` rows 13–19): L1 Cost Centre User → L2 **SIC** → L3 **BIC** → L4 **TS Department** → L5 **Finance Department**. Return = "→ L1 User" at *every* level, not one-level-back. Modify: L1=Yes(Draft/Returned), SIC/BIC=No, TS/Finance=Yes.
- **New Budget Head/Sub Head list** (`MAIN SHEET` rows 26–58): a `Broad PNL Head` grouping (R&M / Power / Chemical) sits above Budget Head; 32 Budget Sub Heads across 17 Budget Heads (7 new Fund codes under Power/Chemical not in the old 25-row seed).
- New per-Budget-Sub-Head financial fields (LY Actual, Approved BE, YTD Actual — all admin-uploaded; Proposed RBE/BE — user-entered, auto-computed, (P)/(A)-tagged) and a validation rule (RBE ≥ YTD Actual — the minimum a Location User may enter for RBE is the actual expenditure already incurred, i.e. YTD Actual). **Fallback-to-Approved-BE-when-blank was dropped 2026-08-24 — see decision 4 below, superseded.**
- A terminology mandate: **SIC**, **BIC**, **Base/LOC**, **Budget Sub Head** used consistently everywhere; no loose "Description"/"Category" labels.
- Admin-controlled FY: exactly one open `BudgetCycle` drives "CFY"/"NFY" labeling app-wide.

### Decisions confirmed with the user (via AskUserQuestion, this session)

1. Every return (SIC/BIC/TS/Finance) goes all the way back to L1/Draft — replacing one-level-back entirely.
2. Existing `BudgetHeader`/`BudgetEntry`/`ApprovalAction`/`BudgetAttachment` data is **wiped** as part of the schema change (masters, Employees, Users/logins untouched).
3. The single combined actuals workbook is replaced by **three separate upload flows** (LY Actual, Approved BE, YTD Actual), each with its own downloadable sample template.
4. ~~Both Proposed RBE and Proposed BE fall back to the Approved BE figure, literally, when the Location User leaves them blank.~~ **SUPERSEDED 2026-08-24**: no fallback/default of any kind for Proposed RBE or Proposed BE. Whatever the Location User enters (including blank/zero) is the value stored and shown — never substituted with Approved BE or any other figure. The `(P)`/`(A)` tagging (Proposed vs. Approved-BE-derived) goes away along with the fallback it existed to label; a blank entry just displays as blank/0, not as an Approved-BE-sourced figure. The RBE ≥ YTD Actual validation (see Context above) still applies to whatever value is actually entered — it is not affected by this change, only the blank-fills-in-from-Approved-BE behavior is removed.
5. A Budget Sub Head may appear as **multiple rows** within one proposal (not unique) — aggregation for the fallback/(P)/(A)/validation logic happens per Sub Head across all its rows.
6. A bulk Excel upload for assigning Location Users to Cost Centres was built alongside the existing one-at-a-time Authorization screen.

---

## Addendum (2026-08-24): Broad PNL Head-driven entry structure — R&M vs Power vs Chemical

**Status: implemented, migrated, seeded, and verified 2026-08-24** — see checklist items 13-18 below. This section is kept as the design record; the "spec only" framing below describes how it was originally planned, not current status.

### Why

`BudgetHead.broadPnlHead` (`RM | POWER | CHEMICAL`) already exists in the schema (see checklist item 1), but today's `EntryGrid` treats every Sub Head identically — a Material + Service split, exactly as demoed. That's only correct for **R&M**. **Power** and **Chemical** budget it differently: instead of Material/Service, the Location User enters a **Quantity**, and an **Amount** is calculated arithmetically (Qty × Rate) — that calculated Amount is the figure that becomes Proposed RBE/BE, not a directly-typed monetary figure.

### Per-Broad-PNL-Head entry behavior

| Broad PNL Head | Fields the Location User enters | Where Rate comes from | Where UOM comes from |
|---|---|---|---|
| **R&M** | RBE Material, RBE Service, BE Material, BE Service (unchanged, today's behavior) | n/a | n/a |
| **Power** | Qty **and** Rate, for both RBE and BE | User types it in, each row, each time — **no admin rate master for Power** | Admin master (read-only on the entry screen) |
| **Chemical** | Qty only, for both RBE and BE | Admin master, **live-linked** (see "Rate change impact" below) | Admin master (read-only on the entry screen) |

For both Power and Chemical, this is captured as **separate RBE and BE sets** — mirroring today's RBE Material/Service vs BE Material/Service split:
- RBE Qty, RBE Rate, **RBE Amount** (= RBE Qty × RBE Rate, computed)
- BE Qty, BE Rate, **BE Amount** (= BE Qty × BE Rate, computed)

RBE Amount / BE Amount computed this way is what feeds the Sub Head summary table and the RBE-≥-YTD-Actual validation — **the validation applies here exactly as it does for R&M** (confirmed by the user): a Chemical/Power row's aggregated RBE Amount per Sub Head must be ≥ that Sub Head's YTD Actual, same rule, same enforcement point (`saveDraftEntries`).

### UOM display

UOM is set **per Budget Sub Head** (not per Budget Head — two Sub Heads under the same Power/Chemical Budget Head can use different units, e.g. kWh vs Litres). It is shown **inline per row**, next to that row's Qty/Rate inputs (e.g. a row reads "Qty (Ltr)"), not as a single fixed table column header — because a table-wide header would be wrong the moment two Sub Heads in the same head have different UOMs.

### Rate/UOM master data — new, dedicated table(s)

Per the user's direction, this is **not** folded onto the existing shared `BudgetHead`/`BudgetSubHead` masters (which stay structurally uniform across R&M/Power/Chemical — same table, same shape). Instead, a **separate, dedicated master**, fully admin-CRUD, holds:
- **UOM** — one value per Power/Chemical Sub Head, static (no financial-year dimension — a unit of measure doesn't change year to year).
- **Rate** — Chemical Sub Heads only (Power has no master rate at all, per the table above), and it **does vary by financial year** (confirmed): admin can set a distinct rate for the RBE-year and a distinct rate for the BE-year of whatever cycle is currently open, since chemical prices typically escalate year over year.

Rough schema shape (to be finalized at actual implementation time, not migrated yet):
- `SubHeadUom(subHeadId FK→BudgetSubHead unique, uom String)` — Power + Chemical Sub Heads only.
- `SubHeadRate(subHeadId FK→BudgetSubHead, fiscalYear String, rate Decimal(18,2))`, unique on `[subHeadId, fiscalYear]` — Chemical Sub Heads only, one row per Sub Head per fiscal year (so the RBE-year row and BE-year row are two separate, independently admin-editable records).
- `BudgetEntry` gains nullable `rbeQty`, `rbeRate`, `beQty`, `beRate` (Decimal(18,2)) columns, used when the entry's Sub Head's parent Budget Head is `POWER`/`CHEMICAL`; the existing `rbeMaterial`/`rbeService`/`beMaterial`/`beService` columns stay as-is and are used when it's `RM`. RBE/BE Amount stays **computed, not stored**, same convention as today's Material+Service Totals — **except** see the freeze rule below, which is the one case an Amount does get persisted.
- Admin UI: a **new Masters sub-tab**, e.g. "Rates & UOM" (alongside Locations/Funds/Roles/Actuals/Audit/Settings) — lists Power+Chemical Sub Heads, each with an editable UOM field and, for Chemical rows only, a small per-fiscal-year Rate table (add/edit a rate for a given FY string).

### Rate change impact on already-saved budgets — confirmed design

**Live-linked until final approval; frozen permanently at approval.** Specifically:
- While a `BudgetHeader` is in **any** non-`APPROVED` status (`DRAFT`, `PENDING_STATION`, `PENDING_BASE`, `PENDING_TS`, `PENDING_FINANCE`), a Chemical row's Rate and Amount are always derived from the **current** `SubHeadRate` master value for that Sub Head + fiscal year — if admin edits the master rate, every not-yet-approved budget using that Sub Head reflects the new rate immediately (on next view/save), not just budgets created after the change.
- The moment Finance's final Approve action transitions the header to `APPROVED`, the then-current resolved Rate and Amount must be **persisted onto the `BudgetEntry` row permanently** — a one-time freeze at that exact transition. After that, the row's own stored `rbeRate`/`beRate` (not a live master lookup) is authoritative forever, matching the existing "APPROVED = final, read-only" rule so an approved budget's figures can never move again regardless of later admin rate edits. This freeze step needs to be added to `lib/workflow.ts`'s Finance-level `approve()` path specifically (the one transition that reaches `APPROVED`) when this is actually implemented.
- Power rows need no such freeze logic — the user types the Rate directly each time, so it's already a stored, static value with no live master to drift from.

### Reports

Qty, Rate, and Amount (RBE and BE, separately) must be retained as real stored columns on `BudgetEntry` (per the schema sketch above), not only surfaced as a computed on-screen total — this is specifically so `lib/reports.ts`/the Reports screen and export can break figures down by Qty/Rate/Amount later, per the user's explicit ask. The exact report column layout is deferred to actual implementation time, not detailed further here.

### Checklist (implemented 2026-08-24)

13. ✅ Schema: `SubHeadUom`, `SubHeadRate` tables; `BudgetEntry.rbeQty/rbeRate/beQty/beRate` columns; migration `20260824000000_main_sheet_rework_and_broad_pnl` applied to the real DB (this migration also finally applied the entire 2026-08-21 "main_sheet_rework" schema that had never actually been migrated — see "What's verified" below for the messy path that took).
14. ✅ Admin Masters — new "Rates & UOM" sub-tab (`RatesUomTab.tsx`/`RateUomForm.tsx`/`saveSubHeadRateUom` in `actions.ts`): UOM CRUD (Power+Chemical) + per-FY Rate CRUD (Chemical only), keyed to the open cycle's CFY/NFY. A blank Rate input means "leave unchanged", never "set to zero".
15. ✅ `EntryGrid.tsx` — conditionally renders Material/Service inputs (R&M) vs Qty/Rate inputs (Power/Chemical) based on the row's Sub Head's parent Budget Head's `broadPnlHead`; inline UOM label per row (e.g. "Qty (Ltr)"); Chemical Rate field read-only, showing the live master rate pre-approval; Power Rate field freely editable. Shared amount math lives in `src/lib/entry-amount.ts` (`rbeAmount`/`beAmount`/`numOrZero`), used identically by `EntryGrid.tsx`, `actions.ts`, `approvals/page.tsx`, Home (`src/app/(app)/page.tsx`), and `lib/reports.ts` — all previously computed RBE/BE as Material+Service only, missing Power/Chemical entirely; all fixed to go through the shared helper.
16. ✅ `saveDraftEntries`'s RBE-≥-YTD-Actual validation extended to Power/Chemical's computed RBE Amount; CHEMICAL rows' Rate is always server-re-resolved from the live master, never trusting whatever the client submitted.
17. ✅ `lib/workflow.ts`'s `freezeChemicalRatesOnApproval`, called from `approvals/actions.ts`'s `actOnHeader` exactly when a Finance approval transitions a header to `APPROVED` — DB-verified (see below) that a post-freeze admin Rate edit does NOT move an already-approved entry, while pre-approval edits DO flow through live.
18. ✅ Reports (`lib/reports.ts`) — Proposed RBE/BE aggregation fixed to include Power/Chemical Qty×Rate (was silently Material+Service-only before, undercounting every non-R&M row); Qty/Rate/Amount are retained as real `BudgetEntry` columns for future detailed report breakdowns, but the on-screen/exported Reports table itself is still the existing Cost-Centre-level aggregate — a dedicated Qty/Rate/Amount breakdown view was not built (deferred; the data is captured and available whenever that's wanted).

---

## Progress checklist

### 1. Schema rewrite — ✅ done
`webapp/prisma/schema.prisma`:
- `BroadPnlHead` enum (`RM | POWER | CHEMICAL`) added; `BudgetHead.broadPnlHead` field added.
- `BudgetLineItem` renamed to `BudgetSubHead` (`code` = Fund code, `name` = Budget Sub Head text, dropped the old `description` naming).
- `BudgetHeader` **no longer has `budgetHeadId`** — unique constraint is now `@@unique([costCentreId, cycleId])` (the MAIN RULE).
- `BudgetEntry.lineItemId` → `subHeadId` (FK → `BudgetSubHead`); `itemDescription` field dropped. No uniqueness on `[headerId, subHeadId]` — multiple rows per Sub Head are allowed (confirmed).
- `ActualsDataType` renamed: `ACTUAL_EXPENDITURE → LY_ACTUAL`, `ONGOING_EXPENDITURE → YTD_ACTUAL`, `APPROVED_BE` unchanged. `ActualsImportBatch` gained a `dataType` field. `ActualsRow` simplified to `companyCode, costCentreCode, costCentreName, subHeadCode, subHeadName, fiscalYear, amount, dataType` (dropped unused columns: glAccount, commitmentItem, commitmentItemName, fundsCenterName, lineItemName, valTypeText, amountType, period — none were consumed downstream).

**⬜ NOT yet done: the actual migration has not been run against a database.** Next step: `npx prisma migrate dev --name main_sheet_rework` (or, since the local `.pgdata` Postgres instance needs to be started first per `CLAUDE.md` §8 — check `pg_ctl ... status` before assuming it's running). Since existing transactional data is being wiped by agreement, it's fine to let the migration drop/recreate the transactional tables rather than hand-write a data-preserving migration.

### 2. Seed rewrite — ✅ code done, ⬜ not re-run
`webapp/prisma/seed.ts` now parses `MAIN SHEET` rows 26–58 (columns: SN, Broad PNL Head, FUND, Budget Head, Budget Sub Head) instead of the old `Fund Centre` sheet. Asserts 34 Cost Centres / **17 Budget Heads / 32 Budget Sub Heads** / 311 Employees. `Location Mapping` and `Data base Emplyee` sections unchanged (verified by inspection that `MAIN SHEET` itself has no location data — its used range stops at row 58/column F, and `Location Mapping`'s "Location User" column header has no data under it — so `Location Mapping` remains the authority for Cost Centres, **correcting** a literal reading of the original request that said location mapping should come from `MAIN SHEET`). **Needs to be run** (`npx prisma db seed`) after the migration above.

### 3. Shared libs — ✅ done
- `src/lib/labels.ts` (**new**) — `ROLE_LABELS` (SIC/BIC/etc.), `ROLE_FULL_NAMES`, `BROAD_PNL_HEAD_LABELS`, `BASE_LOC_LABEL`, `BUDGET_SUB_HEAD_LABEL`, `formatCycleLabel`/`cfyLabel`/`nfyLabel`.
- `src/lib/cycle.ts` (**new**) — `getActiveCycle()` (the one open cycle), `setActiveCycle()` (enforces at most one open cycle at a time — auto-closes others), `previousFinancialYear()` (FY string arithmetic for LY Actual lookups).
- `src/lib/workflow.ts` — `returnOneLevel` replaced with `returnToL1`; added `MODIFY_ROLE_FOR_STATUS` and `canEditHeader(access, header)` (the one shared editability check used by both Create Budget and Approve Budget: DRAFT+LOCATION_USER, or PENDING_TS+TS_DEPT, or PENDING_FINANCE+FINANCE_DEPT).
- `src/lib/actuals.ts` (**new**, replaces the deleted `actuals-import.ts`) — `parseLyActualWorkbook`/`parseApprovedBeWorkbook`/`parseYtdActualWorkbook` (share one row parser, differ only in `dataType`), `buildActualsSampleWorkbook()` for the downloadable templates. Column format (7 columns: Company Code, Cost Centre Code, Cost Centre Name, Budget Sub Head Code, Budget Sub Head Name, Fiscal Year, Amount) is my own call per the user's "decide the format" instruction — trimmed to exactly what's consumed downstream.
- `src/lib/sub-head-actuals.ts` (**new**) — `getSubHeadActualsMap(costCentreCode, cycle)`, the shared LY Actual/Approved BE/YTD Actual lookup used by both the Create Budget entry grid and its save-time validation.
- `src/lib/reports.ts` — updated for the renamed enum values and switched from an ad hoc "most-recently-created cycle" default to `getActiveCycle()`.
- `src/lib/attachments.ts` — `MAX_ATTACHMENT_SIZE_BYTES` raised to 30MB, `ALLOWED_ATTACHMENT_EXTENSIONS` whitelist added (`.pdf .xls .xlsx .doc .docx .ppt .pptx .csv`), `isAllowedAttachmentName()` helper.

### 4. Admin — Masters — ✅ done
- **Funds tab**: `BudgetHead` create form gained a `broadPnlHead` select; listing now grouped by Broad PNL Head. `BudgetSubHead` create/delete (renamed from `BudgetLineItem`).
- **Actuals tab**: three separate upload sections (LY Actual / Approved BE / YTD Actual), each with its own "Download sample template" link and its own history rows filtered by type.
- **Settings tab**: single-open-cycle enforcement wired in (`setActiveCycle`); labels switched to CFY/NFY; new cycles are created closed by default, admin opens explicitly.
- **Roles tab**: replaced the old static 5-row table with the MAIN SHEET L1–L5 matrix verbatim (SIC/BIC labels, Modify/Return/Approve columns).
- **New Employees tab**: full CRUD (create/edit/delete) over the `Employee` master — this is what "admin can add/edit/update the Employee master" maps to.
- **Locations tab**: "Base" column header → "Base/LOC".

### 5. Admin — Authorization — ✅ done
- `AddAccessGrantForm` LOCATION scope is now a multi-select (creates one `UserAccess` row per selected Cost Centre in one submission) — no schema change needed.
- **New**: `BulkAssignForm` + `bulkAssignAccess` Server Action — upload an Employee No / Role / Cost Centre Code sheet (template at `/api/templates/user-location-mapping`) to add many access grants at once. Only adds grants to employees who **already have a login** — does not create logins itself (reports per-row errors for employees without one).

### 6. New API template routes — ✅ done
`/api/templates/ly-actual`, `/api/templates/approved-be`, `/api/templates/ytd-actual`, `/api/templates/user-location-mapping` — all admin-gated GET routes generating a downloadable `.xlsx` on the fly via `exceljs`.

### 7. Create Budget — ✅ done
- `create/page.tsx` + `create/actions.ts`: picker simplified to **Cost Centre only** (FY is admin-controlled via the one open cycle; Budget Head selection now happens inside the proposal page). `openBudgetHeader` finds-or-creates by `[costCentreId, cycleId]`.
- `[id]/page.tsx`: header block is fully read-only for everyone; editability of the entry grid now comes from `canEditHeader()` (so TS/Finance can edit in-place during their pending stage, not just the original Location User in Draft). Added a "History" section (shared component, see below).
- `[id]/EntryGrid.tsx` (**major rewrite**): "Add Budget Head" control (grouped by Broad PNL Head) → per-head card → **Sub Head summary table** (LY Actual/Approved BE/YTD Actual read-only + Proposed RBE/BE aggregated across that Sub Head's rows, red-highlighted when below YTD Actual) → the entry-row editor below it ("+ Add Row" picks a Budget Sub Head, repeats allowed). Attachments now 30MB / whitelisted types. **Updated 2026-08-24**: no fallback-to-Approved-BE and no `(P)`/`(A)` tagging — see decision 4 (superseded) above; the summary table shows exactly what was entered, blank/0 included.
- `[id]/actions.ts`: `saveDraftEntries` reworked for `subHeadId`; added RBE-≥-YTD-Actual validation (aggregated per Sub Head, only when the entered sum is nonzero) and a negative-amount guard; added **field-level audit diffs** (`MODIFY_ENTRY`/`ADD_ENTRY`/`DELETE_ENTRY` on `AuditLog`, entityType `BudgetHeader`) whenever the actor is on the TS/Finance modify path (not the original Draft author); `submitBudget` now explicitly rejects being called from any status other than `DRAFT`.

### 8. Approve Budget — ✅ done
- `actions.ts`: `actOnHeader` now calls `returnToL1` — any return lands back on `DRAFT` at L1, `currentLevel` resets to 0.
- `page.tsx`: when the viewer can `canEditHeader()` (i.e. holds TS_DEPT/FINANCE_DEPT for a header currently pending at their level), renders the **same `EntryGrid`** component used by Create Budget (editable) instead of the old read-only list — SIC/BIC still get the read-only list + remarks form. Added the shared History section.

### 9. Shared History component — ✅ done
`src/components/History.tsx` (**new**) — merges `ApprovalAction` (approve/return timeline) with the new `MODIFY_ENTRY` audit rows into one timeline; used on both `/budgets/[id]` and `/approvals` so "who returned when with what comment" and "who changed which field" are both visible in one place, on either screen.

### 10. Home Dashboard & Reports — ✅ done
Reworked for the schema change (Budget-Head-level grouping now derives via `entry.subHead.budgetHead` since `BudgetHeader` no longer carries `budgetHeadId` directly); `ActualsDataType` references renamed; both switched from ad hoc "most recent cycle" logic to `getActiveCycle()`; FY labels switched to `formatCycleLabel`/`cfyLabel`/`nfyLabel`; Home's KPI tiles relabeled LY Actual / Approved BE (CFY) / Proposed RBE (CFY) / YTD Actual (CFY) / Proposed BE (NFY).

### 11. Terminology pass — 🟡 mostly done, some gaps likely remain
Swept: nav/labels module, Locations tab, Home dashboard filters, Roles tab, Topbar role summary (was showing raw enum values like `STATION_INCHARGE` — fixed to use `ROLE_LABELS`). **Not exhaustively re-checked**: `CreateUserForm.tsx` (Authorization), `ApprovalActionForm.tsx`, and any other small components not directly touched during the rewrite — worth a final grep pass for `STATION_INCHARGE`/`BASE_INCHARGE` rendered raw, or "Base" used unqualified, before calling this fully done.

### 12. CLAUDE.md update — ⬜ not started
CLAUDE.md's §3 (decisions), §6 (data model), §7 (routes), §9 (build order/status) still describe the **pre-rework** schema/workflow. Needs a full pass once the rework is verified end-to-end, per the project's own convention of keeping CLAUDE.md as the single source of truth. Do this last, after verification below — don't document behavior that hasn't actually been run yet.

---

## What's verified so far vs. not

**Verified 2026-08-24 (this session):**
- `npx prisma generate` / `npx tsc --noEmit` / `npm run build` — all clean.
- **Migration actually applied to the real DB** — this took a detour worth recording: `prisma migrate dev` refuses to run non-interactively in this environment at all (not just on destructive-change prompts), and the existing 7 test `BudgetHeader`/`BudgetEntry` rows plus the old 10/25-row pre-MAIN-SHEET masters blocked a straight diff-and-apply. Resolved by (1) confirming with the user that truncating `budget_entries`/`budget_headers`/`approval_actions`/`budget_attachments`/`budget_heads`/`budget_line_items`/`actuals_rows`/`actuals_import_batches`/`audit_logs` was fine (all test data; Users/Employees/CostCentres explicitly preserved, matching decision 2 above), (2) generating the migration SQL via `prisma migrate diff` (needed `datasource.shadowDatabaseUrl` added to `prisma.config.ts` + a new `SHADOW_DATABASE_URL` in `.env` — Prisma 7's `migrate diff` requires this explicitly, unlike `migrate dev`), (3) a first `migrate deploy` attempt partially applied (committed just the `BroadPnlHead` enum type before failing) — resolved via `migrate resolve --rolled-back`, then regenerating the diff against the *actual* current DB state (`--from-config-datasource`) and hand-verifying every remaining column/table against `\d` output before applying the corrected SQL directly via `psql -1` (one transaction) and `migrate resolve --applied`. Migration file: `prisma/migrations/20260824000000_main_sheet_rework_and_broad_pnl/`. This single migration carries **both** the 2026-08-21 main-sheet-rework schema (which had never actually been migrated until now, despite being marked "done" in code) **and** the 2026-08-24 Broad PNL additions.
- `npx prisma db seed` — printed counts matched exactly: 34 / 17 / 32 / 311.
- Existing `admin`/`location.user`/`station.incharge`/`base.incharge`/`ts.dept`/`finance.dept` logins and the open `2026-27`/`2027-28` cycle survived the truncate (only the tables above were cleared) — no bootstrap re-run was needed.
- **DB-level script** (`prisma/verify-broad-pnl.ts`, run then deleted) against the real seeded DB: `numOrZero`/`rbeAmount`/`beAmount` blank-is-zero/no-fallback behavior; `getSubHeadRateUomMap` resolves UOM (Power+Chemical) and per-FY Rate (Chemical only) and reflects an admin Rate edit immediately (live-linked pre-approval); a Chemical entry saved with a deliberately-wrong client-submitted Rate ends up stored with the server-resolved master Rate instead; `freezeChemicalRatesOnApproval` captures the Rate in effect at the moment it's called and a *subsequent* admin Rate edit does **not** move the now-frozen entry, while a Power entry's Rate (always user-typed) is untouched by any of this; R&M/Power/Chemical Amount computation (Material+Service vs Qty×Rate) all correct.
- **Live HTTP smoke test** against the actual running app (logged in as `location.user` via the real NextAuth credentials flow, cookie-based): `/`, `/budgets/create` both 200 with no error markers; submitted the real `openBudgetHeader` Server Action via a raw form POST (reproducing Next's plain-form-action protocol) and got a real redirect to a new `/budgets/[id]`; that page rendered 200 with both "Power" and "Chemical" Broad PNL groups present in the Add-Budget-Head control. Test header deleted afterward. **Not** exercised via live HTTP: the client-JS-driven `saveDraftEntries`/`submitBudget`/`actOnHeader` calls themselves (EntryGrid's React state + Next's Flight-protocol action-invocation isn't reproducible via curl the way a plain form is) — their logic was proven via the DB-level script instead, and their auth-gating (`canEditHeader`) is pre-existing, unchanged code.
- **Hosted**: `serpl.efficientcorporates.in` is live and serving this build (see the CLOUDFLARE_TUNNEL.md port-conflict incident note — SERPL was moved to port 3010, not 3000, after finding port 3000 already occupied by an unrelated project on this machine).

**Still NOT verified — carried over from the original 2026-08-21 rework, not touched this session:**
6. Full manual/DB-level 5-level approval walkthrough (SIC→BIC→TS-edit-in-place→Finance) with a `MODIFY_ENTRY` audit-row check, and a return-lands-on-DRAFT/L1 check.
8. Upload one file through each of the three actuals endpoints (LY Actual / Approved BE / YTD Actual) and confirm the sample template columns match.
9. Confirm `getActiveCycle()`/`setActiveCycle()` enforce exactly one open cycle app-wide (Home/Reports/Create Budget agreeing).
10. Try the bulk Authorization upload end-to-end.
11. Finish the terminology sweep noted in §11 above.
12. Update `CLAUDE.md` once the above is confirmed — still not started; this file (not CLAUDE.md) remains the authoritative status for this rework.

**Git**: nothing from this rework has been committed yet — check `git status`/`git diff` before assuming otherwise; still sitting on top of `build/initial-implementation`.
