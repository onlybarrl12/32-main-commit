// Static reference table — the MAIN SHEET's "Final L1-L5 Approval /
// Processing Matrix" (business_knowledge/Data for R&M Portal.xlsx, MAIN
// SHEET rows 13-19), verbatim. Fixed application logic (Role is a Prisma
// enum, not a business-editable table) — see src/lib/workflow.ts for the
// state machine this drives.
const MATRIX = [
  {
    level: "L1",
    role: "Cost Centre User (Location User)",
    purpose: "Create, complete, correct and submit the Cost Centre package.",
    modify: "Yes — Draft / Returned",
    ret: "—",
    approve: "No",
  },
  {
    level: "L2",
    role: "SIC (Station In-charge)",
    purpose: "Operational / requirement approval.",
    modify: "No",
    ret: "Yes → L1 User",
    approve: "Yes",
  },
  {
    level: "L3",
    role: "BIC (Base In-charge)",
    purpose: "Cost Centre-level budget approval.",
    modify: "No",
    ret: "Yes → L1 User",
    approve: "Yes",
  },
  {
    level: "L4",
    role: "TS Department",
    purpose: "Technical review and authorised modification.",
    modify: "Yes",
    ret: "Yes → L1 User",
    approve: "Yes",
  },
  {
    level: "L5",
    role: "Finance Department",
    purpose: "Financial review and authorised modification.",
    modify: "Yes",
    ret: "Yes → L1 User",
    approve: "Yes",
  },
];

export function RolesTab() {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
        Final L1–L5 Approval / Processing Matrix
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
            <th className="pb-2 font-medium">Level</th>
            <th className="pb-2 font-medium">Role / Department</th>
            <th className="pb-2 font-medium">Purpose</th>
            <th className="pb-2 font-medium">Modify</th>
            <th className="pb-2 font-medium">Return</th>
            <th className="pb-2 font-medium">Approve</th>
          </tr>
        </thead>
        <tbody>
          {MATRIX.map((r) => (
            <tr key={r.level} className="border-b border-stone-50 last:border-0">
              <td className="py-2 font-medium text-stone-800">{r.level}</td>
              <td className="py-2 text-stone-700">{r.role}</td>
              <td className="py-2 text-stone-500">{r.purpose}</td>
              <td className="py-2 text-stone-500">{r.modify}</td>
              <td className="py-2 text-stone-500">{r.ret}</td>
              <td className="py-2 text-stone-500">{r.approve}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-stone-400">
        A Return at any level (SIC/BIC/TS/Finance) sends the budget all the way back to L1 (Draft) — not one level
        back. A Location User may hold multiple Cost Centres; a SIC may hold multiple Cost Centres; a BIC may hold
        multiple Bases/LOCs; multiple users may be assigned TS Dept or Finance Dept.
      </p>
    </div>
  );
}
