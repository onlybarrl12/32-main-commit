"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS = [
  { key: "summary", label: "Summary" },
  { key: "rm-fund-wise", label: "R&M — Fund-wise" },
  { key: "rm-compiled", label: "R&M — Compiled" },
  { key: "power-fuel", label: "Power & Fuel" },
  { key: "chemical", label: "Chemical" },
  { key: "status", label: "Cost Centre Status" },
];

/** Same pattern as Masters' sub-tabs (see admin/masters/MasterTabs.tsx) — a ?tab= switch, added 2026-08-26 for the new report formats alongside the original Summary report, which stays the default so an existing bookmark to /reports is unaffected. */
export function ReportTabs() {
  const searchParams = useSearchParams();
  const active = searchParams.get("tab") ?? "summary";

  return (
    <div className="flex bg-stone-100 rounded-lg p-0.5 w-fit flex-wrap">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/reports?tab=${t.key}`}
          className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
            active === t.key ? "bg-white text-brand-navy shadow-sm" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
