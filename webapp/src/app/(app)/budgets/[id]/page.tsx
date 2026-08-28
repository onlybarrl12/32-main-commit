import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { canEditHeader, STATUS_LABELS } from "@/lib/workflow";
import { BASE_LOC_LABEL, BROAD_PNL_HEAD_LABELS, formatCycleLabel, lyFyLabel, cfyLabel, nfyLabel } from "@/lib/labels";
import { getSubHeadActualsMap } from "@/lib/sub-head-actuals";
import { getSubHeadRateUomMap } from "@/lib/sub-head-rate-uom";
import { rbeAmount, beAmount, resolveRate, type BroadPnlHeadCode } from "@/lib/entry-amount";
import { formatLakh } from "@/lib/format";
import { EntryGrid } from "./EntryGrid";
import { History } from "@/components/History";
import type { EntryInput } from "./actions";

export default async function BudgetHeaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const header = await prisma.budgetHeader.findUnique({
    where: { id },
    include: {
      costCentre: { include: { pipeline: true, companyCode: true, base: true } },
      cycle: true,
      entries: { include: { subHead: { include: { budgetHead: true } }, attachments: true }, orderBy: { createdAt: "asc" } },
      createdByUser: true,
    },
  });
  if (!header) notFound();

  const editable = await canEditHeader(user.access, header);

  const budgetHeads = await prisma.budgetHead.findMany({
    include: { subHeads: { orderBy: { code: "asc" } } },
    orderBy: { name: "asc" },
  });

  const allSubHeadIds = budgetHeads.flatMap((h) => h.subHeads.map((s) => s.id));
  const [actualsMap, rateUomMap] = await Promise.all([
    getSubHeadActualsMap(header.costCentre.code, header.cycle),
    getSubHeadRateUomMap(allSubHeadIds, header.cycle),
  ]);

  const attachmentsByEntryId: Record<string, { id: string; fileName: string }[]> = {};
  for (const e of header.entries) {
    attachmentsByEntryId[e.id] = e.attachments.map((a) => ({ id: a.id, fileName: a.fileName }));
  }

  const initialEntries: EntryInput[] = header.entries.map((e) => ({
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
  }));

  // KPI-tile totals — Amount is Material+Service for R&M or (live, pre-approval) Qty x Rate for Power/Chemical,
  // matching exactly what EntryGrid computes and displays (see src/lib/entry-amount.ts).
  const totalRbe = header.entries.reduce((s, e) => {
    const broadPnlHead: BroadPnlHeadCode = e.subHead.budgetHead.broadPnlHead;
    const rbeRate = resolveRate(broadPnlHead, Number(e.rbeRate), rateUomMap[e.subHeadId]?.rbeRate, header.status);
    return s + rbeAmount(
      { rbeMaterial: Number(e.rbeMaterial), rbeService: Number(e.rbeService), rbeQty: Number(e.rbeQty), rbeRate, beMaterial: 0, beService: 0, beQty: 0, beRate: 0 },
      broadPnlHead
    );
  }, 0);
  const totalBe = header.entries.reduce((s, e) => {
    const broadPnlHead: BroadPnlHeadCode = e.subHead.budgetHead.broadPnlHead;
    const beRate = resolveRate(broadPnlHead, Number(e.beRate), rateUomMap[e.subHeadId]?.beRate, header.status);
    return s + beAmount(
      { beMaterial: Number(e.beMaterial), beService: Number(e.beService), beQty: Number(e.beQty), beRate, rbeMaterial: 0, rbeService: 0, rbeQty: 0, rbeRate: 0 },
      broadPnlHead
    );
  }, 0);
  // Cost-Centre-level totals — every admin-uploaded actuals row for this
  // Cost Centre (whichever Budget Head/Sub Head it's under), not just Sub
  // Heads the user has actually proposed something for this cycle. Matches
  // exactly what the "Reference: Actuals" table below sums to (its own
  // Subtotal row) — fixed 2026-08-25 after the top cards were found always
  // showing zero on a fresh proposal (they were summing only touched Sub
  // Heads, which is empty before anything's been added).
  const totalApprovedBe = Object.values(actualsMap).reduce((s, a) => s + a.approvedBe, 0);
  const totalLyActual = Object.values(actualsMap).reduce((s, a) => s + a.lyActual, 0);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            {header.costCentre.code} — {header.costCentre.name}
          </h2>
          <p className="text-xs text-stone-500">
            {formatCycleLabel(header.cycle)} · Created by {header.createdByUser.username}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium border ${
            header.status === "APPROVED"
              ? "bg-brand-navy-light text-brand-navy border-brand-navy-light"
              : header.status === "DRAFT"
                ? "bg-stone-100 text-stone-500 border-stone-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          {STATUS_LABELS[header.status]}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
          Budget Creation Proposal — locked fields
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Field label="Region" value="SERPL" />
          <Field label={BASE_LOC_LABEL} value={header.costCentre.base.name} />
          <Field label="Operating Location" value={header.costCentre.name} />
          <Field label="Company Code" value={header.costCentre.companyCode.code} />
          <Field label="Pipeline" value={header.costCentre.pipeline.code} />
          <Field label="Cost Centre" value={header.costCentre.code} />
          <Field label="Financial Year" value={formatCycleLabel(header.cycle)} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label={`LY Actual (${lyFyLabel(header.cycle)})`} value={formatLakh(totalLyActual)} note="Admin-maintained" />
        <KpiTile label={`Approved BE (${cfyLabel(header.cycle)})`} value={formatLakh(totalApprovedBe)} note="Admin-maintained" />
        <KpiTile label={`RBE (${cfyLabel(header.cycle)})`} value={formatLakh(totalRbe)} note="This proposal" />
        <KpiTile label={`BE (${nfyLabel(header.cycle)})`} value={formatLakh(totalBe)} note="This proposal" />
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <EntryGrid
          headerId={header.id}
          headerStatus={header.status}
          costCentreName={`${header.costCentre.code} — ${header.costCentre.name}`}
          cycleLabel={formatCycleLabel(header.cycle)}
          lyFyLabel={lyFyLabel(header.cycle)}
          cfyFyLabel={cfyLabel(header.cycle)}
          nfyFyLabel={nfyLabel(header.cycle)}
          initialEntries={initialEntries}
          budgetHeads={budgetHeads.map((h) => ({
            id: h.id,
            name: h.name,
            broadPnlHead: h.broadPnlHead,
            broadPnlHeadLabel: BROAD_PNL_HEAD_LABELS[h.broadPnlHead],
            subHeads: h.subHeads.map((s) => ({ id: s.id, code: s.code, name: s.name })),
          }))}
          subHeadActuals={actualsMap}
          rateUomMap={rateUomMap}
          editable={editable}
          attachmentsByEntryId={attachmentsByEntryId}
        />
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">History</h3>
        <History headerId={header.id} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-stone-400">{label}</div>
      <div className="font-medium text-stone-800">{value}</div>
    </div>
  );
}

function KpiTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className="text-lg font-bold text-stone-900 tabular-nums mt-1">{value}</div>
      <div className="text-xs text-stone-400 mt-0.5">{note}</div>
    </div>
  );
}
