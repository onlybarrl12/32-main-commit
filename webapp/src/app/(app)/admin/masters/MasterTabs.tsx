"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS = [
  { key: "locations", label: "Locations" },
  { key: "funds", label: "Funds" },
  { key: "rates-uom", label: "Rates & UOM" },
  { key: "employees", label: "Employees" },
  { key: "roles", label: "Roles" },
  { key: "actuals", label: "Actuals Upload" },
  { key: "audit", label: "Audit Trail" },
  { key: "settings", label: "Settings" },
];

export function MasterTabs() {
  const searchParams = useSearchParams();
  const active = searchParams.get("tab") ?? "locations";

  return (
    <div className="flex bg-stone-100 rounded-lg p-0.5 w-fit flex-wrap">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/admin/masters?tab=${t.key}`}
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
