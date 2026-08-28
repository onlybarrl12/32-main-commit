import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getAccessibleCostCentreIds } from "@/lib/rbac";
import { canEditHeader, PENDING_STATUS_FOR_ROLE, STATUS_LABELS } from "@/lib/workflow";
import { Prisma, Role } from "@prisma/client";
import { BROAD_PNL_HEAD_LABELS, formatCycleLabel, lyFyLabel, cfyLabel, nfyLabel } from "@/lib/labels";
import { getSubHeadActualsMap } from "@/lib/sub-head-actuals";
import { getSubHeadRateUomMap } from "@/lib/sub-head-rate-uom";
import { rbeAmount, beAmount, resolveRate, type BroadPnlHeadCode } from "@/lib/entry-amount";
import { formatLakh } from "@/lib/format";
import { History } from "@/components/History";
import { ApprovalActionForm } from "./ApprovalActionForm";
import { ApprovalEntriesPanel } from "./ApprovalEntriesPanel";
import type { SummaryEntry } from "./EntriesSummaryView";
import type { EntryInput } from "../budgets/[id]/actions";

const APPROVAL_ROLES: Role[] = [Role.STATION_INCHARGE, Role.BASE_INCHARGE, Role.TS_DEPT, Role.FINANCE_DEPT];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const approvalGrants = user.access.filter((a) => APPROVAL_ROLES.includes(a.role));
  const grantsByRole = new Map<Role, typeof approvalGrants>();
  for (const g of approvalGrants) {
    if (!grantsByRole.has(g.role)) grantsByRole.set(g.role, []);
    grantsByRole.get(g.role)!.push(g);
  }

  const orConditions: Prisma.BudgetHeaderWhereInput[] = [];
  for (const [role, grants] of grantsByRole) {
    const status = PENDING_STATUS_FOR_ROLE[role];
    if (!status) continue;
    const ids = await getAccessibleCostCentreIds(grants);
    if (ids === "ALL") {
      orConditions.push({ status });
    } else if (ids.length > 0) {
      orConditions.push({ status, costCentreId: { in: ids } });
    }
  }

  const pendingHeaders =
    orConditions.length > 0
      ? await prisma.budgetHeader.findMany({
          where: { OR: orConditions },
          include: { costCentre: true, cycle: true, entries: { include: { subHead: { include: { budgetHead: true } } } } },
          orderBy: { updatedAt: "asc" },
        })
      : [];

  const selected = (item && pendingHeaders.find((h) => h.id === item)) || pendingHeaders[0] || null;

  // One live rate/UOM map per distinct cycle among the pending headers (almost always just the
  // one open cycle) — used for both the sidebar totals below and the detail view further down.
  const rateUomMapsByCycle = new Map<string, Record<string, { uom: string | null; rbeRate: number | null; beRate: number | null }>>();
  for (const h of pendingHeaders) {
    if (rateUomMapsByCycle.has(h.cycleId)) continue;
    const subHeadIds = [...new Set(pendingHeaders.filter((x) => x.cycleId === h.cycleId).flatMap((x) => x.entries.map((e) => e.subHeadId)))];
    rateUomMapsByCycle.set(h.cycleId, await getSubHeadRateUomMap(subHeadIds, h.cycle));
  }

  // Amount per entry: Material+Service for R&M, Qty x Rate for Power/Chemical (live master rate for
  // Power/Chemical rows pre-approval — see src/lib/entry-amount.ts and the "Rate change impact" decision).
  // No fallback of any kind: blank/zero shows as exactly zero.
  type TotalableEntry = {
    rbeMaterial: unknown; rbeService: unknown; beMaterial: unknown; beService: unknown;
    rbeQty: unknown; rbeRate: unknown; beQty: unknown; beRate: unknown;
    subHeadId: string; subHead: { budgetHead: { broadPnlHead: BroadPnlHeadCode } };
  };
  function totalOf(entries: TotalableEntry[], rateUomMap: Record<string, { rbeRate: number | null; beRate: number | null }>, headerStatus: string) {
    let rbe = 0;
    let be = 0;
    for (const e of entries) {
      const broadPnlHead = e.subHead.budgetHead.broadPnlHead;
      const live = rateUomMap[e.subHeadId];
      const rbeRate = resolveRate(broadPnlHead, Number(e.rbeRate), live?.rbeRate, headerStatus);
      const beRate = resolveRate(broadPnlHead, Number(e.beRate), live?.beRate, headerStatus);
      rbe += rbeAmount(
        { rbeMaterial: Number(e.rbeMaterial), rbeService: Number(e.rbeService), rbeQty: Number(e.rbeQty), rbeRate, beMaterial: 0, beService: 0, beQty: 0, beRate: 0 },
        broadPnlHead
      );
      be += beAmount(
        { beMaterial: Number(e.beMaterial), beService: Number(e.beService), beQty: Number(e.beQty), beRate, rbeMaterial: 0, rbeService: 0, rbeQty: 0, rbeRate: 0 },
        broadPnlHead
      );
    }
    return { rbe, be };
  }

  let detail: React.ReactNode = null;
  if (selected) {
    const editable = await canEditHeader(user.access, selected);

    const [entriesWithSubHead, budgetHeads, actualsMap] = await Promise.all([
      prisma.budgetEntry.findMany({
        where: { headerId: selected.id },
        include: { subHead: { include: { budgetHead: true } }, attachments: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.budgetHead.findMany({ include: { subHeads: { orderBy: { code: "asc" } } }, orderBy: { name: "asc" } }),
      getSubHeadActualsMap(selected.costCentre.code, selected.cycle),
    ]);
    const detailRateUomMap = await getSubHeadRateUomMap(
      budgetHeads.flatMap((h) => h.subHeads.map((s) => s.id)),
      selected.cycle
    );

    const attachmentsByEntryId: Record<string, { id: string; fileName: string }[]> = {};
    for (const e of entriesWithSubHead) {
      attachmentsByEntryId[e.id] = e.attachments.map((a) => ({ id: a.id, fileName: a.fileName }));
    }

    const totals = totalOf(entriesWithSubHead, detailRateUomMap, selected.status);

    // Financial Position row — same 5 figures as Create Budget's KPI tiles
    // (see budgets/[id]/page.tsx), brought into the approver's screen too
    // per the UXSAMPLE design reference's "Financial Position" panel.
    // Cost-Centre-level totals — every admin-uploaded actuals row for this
    // Cost Centre, not just Sub Heads the user proposed something for this
    // cycle (fixed 2026-08-25, same bug/fix as Create Budget's top cards —
    // see budgets/[id]/page.tsx).
    const totalLyActual = Object.values(actualsMap).reduce((s, a) => s + a.lyActual, 0);
    const totalApprovedBe = Object.values(actualsMap).reduce((s, a) => s + a.approvedBe, 0);
    const totalYtdActual = Object.values(actualsMap).reduce((s, a) => s + a.ytdActual, 0);

    const summaryEntries: SummaryEntry[] = entriesWithSubHead.map((e) => ({
      id: e.id,
      subHeadId: e.subHeadId,
      subHeadCode: e.subHead.code,
      subHeadName: e.subHead.name,
      budgetHeadId: e.subHead.budgetHeadId,
      budgetHeadName: e.subHead.budgetHead.name,
      broadPnlHead: e.subHead.budgetHead.broadPnlHead,
      broadPnlHeadLabel: BROAD_PNL_HEAD_LABELS[e.subHead.budgetHead.broadPnlHead],
      rbeMaterial: Number(e.rbeMaterial),
      rbeService: Number(e.rbeService),
      beMaterial: Number(e.beMaterial),
      beService: Number(e.beService),
      rbeQty: Number(e.rbeQty),
      rbeRate: Number(e.rbeRate),
      beQty: Number(e.beQty),
      beRate: Number(e.beRate),
      workType: e.workType,
      recurringOneTime: e.recurringOneTime,
      referenceTakenFrom: e.referenceTakenFrom ?? "",
      justification: e.justification,
      remarks: e.remarks ?? "",
      attachments: attachmentsByEntryId[e.id] ?? [],
    }));

    detail = (
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-bold text-stone-900">
              {selected.costCentre.code} — {selected.costCentre.name}
            </div>
            <div className="text-xs text-stone-500">
              {formatCycleLabel(selected.cycle)} · {STATUS_LABELS[selected.status]}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-stone-500">Proposed RBE / BE Total</div>
            <div className="text-sm font-semibold text-brand-navy tabular-nums">
              {formatLakh(totals.rbe)} / {formatLakh(totals.be)}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Financial Position — ₹ Lakh</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <FinTile label={`LY Actual (${lyFyLabel(selected.cycle)})`} value={formatLakh(totalLyActual)} />
            <FinTile label={`Approved BE (${cfyLabel(selected.cycle)})`} value={formatLakh(totalApprovedBe)} />
            <FinTile label={`YTD Actual (${cfyLabel(selected.cycle)})`} value={formatLakh(totalYtdActual)} />
            <FinTile label={`RBE (${cfyLabel(selected.cycle)})`} value={formatLakh(totals.rbe)} highlight />
            <FinTile label={`BE (${nfyLabel(selected.cycle)})`} value={formatLakh(totals.be)} highlight />
          </div>
        </div>

        <ApprovalEntriesPanel
          editable={editable}
          summaryEntries={summaryEntries}
          headerId={selected.id}
          headerStatus={selected.status}
          costCentreName={`${selected.costCentre.code} — ${selected.costCentre.name}`}
          cycleLabel={formatCycleLabel(selected.cycle)}
          lyFyLabel={lyFyLabel(selected.cycle)}
          cfyFyLabel={cfyLabel(selected.cycle)}
          nfyFyLabel={nfyLabel(selected.cycle)}
          initialEntries={entriesWithSubHead.map(
            (e): EntryInput => ({
              id: e.id,
              subHeadId: e.subHeadId,
              rbeMaterial: Number(e.rbeMaterial),
              rbeService: Number(e.rbeService),
              beMaterial: Number(e.beMaterial),
              beService: Number(e.beService),
              rbeQty: Number(e.rbeQty),
              rbeRate: Number(e.rbeRate),
              beQty: Number(e.beQty),
              beRate: Number(e.beRate),
              workType: e.workType,
              recurringOneTime: e.recurringOneTime,
              referenceTakenFrom: e.referenceTakenFrom ?? "",
              justification: e.justification,
              remarks: e.remarks ?? "",
            })
          )}
          budgetHeads={budgetHeads.map((h) => ({
            id: h.id,
            name: h.name,
            broadPnlHead: h.broadPnlHead,
            broadPnlHeadLabel: BROAD_PNL_HEAD_LABELS[h.broadPnlHead],
            subHeads: h.subHeads.map((s) => ({ id: s.id, code: s.code, name: s.name })),
          }))}
          subHeadActuals={actualsMap}
          rateUomMap={detailRateUomMap}
          attachmentsByEntryId={attachmentsByEntryId}
        />

        <div>
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">History</h3>
          <History headerId={selected.id} />
        </div>

        <ApprovalActionForm headerId={selected.id} />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-stone-900">Approve Budget</h2>
          <span className="text-xs text-stone-400">Pending at your level ({pendingHeaders.length})</span>
        </div>

        {pendingHeaders.length === 0 && (
          <p className="text-sm text-stone-400 bg-white rounded-xl border border-stone-200 p-4">Nothing waiting on you right now.</p>
        )}

        {pendingHeaders.map((h) => {
          const totals = totalOf(h.entries, rateUomMapsByCycle.get(h.cycleId) ?? {}, h.status);
          const active = selected?.id === h.id;
          return (
            <Link
              key={h.id}
              href={`/approvals?item=${h.id}`}
              className={`block rounded-xl border p-3 bg-white ${
                active ? "border-brand-orange ring-2 ring-brand-orange/20" : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-stone-400">{h.costCentre.code}</span>
                <span className="text-xs text-stone-400">{STATUS_LABELS[h.status]}</span>
              </div>
              <div className="text-sm font-medium text-stone-800">{h.costCentre.name}</div>
              <div className="text-xs text-stone-500 mb-2">{formatCycleLabel(h.cycle)}</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">RBE / BE Total</span>
                <span className="font-semibold text-brand-navy tabular-nums">
                  {formatLakh(totals.rbe)} / {formatLakh(totals.be)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="lg:col-span-3">
        {!selected ? (
          <div className="bg-white rounded-xl border border-stone-200 p-5 text-sm text-stone-500">
            Select a budget from the list to review it.
          </div>
        ) : (
          detail
        )}
      </div>
    </div>
  );
}

function FinTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-brand-navy-light bg-brand-navy-light/40" : "border-stone-200 bg-white"}`}>
      <div className="text-[11px] text-stone-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums mt-0.5 ${highlight ? "text-brand-navy" : "text-stone-900"}`}>{value}</div>
    </div>
  );
}
