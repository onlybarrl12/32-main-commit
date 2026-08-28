/** Shared Pipeline/Base/Location/Financial Year filter bar for the new
 * report tabs (R&M Fund-wise/Compiled, Power & Fuel, Chemical) — per the
 * UXSAMPLE/SERPL_Report_Formats (1).xlsx reference, these filter by
 * Pipeline/Base/Operating Location rather than the original Summary
 * report's Pipeline/Company Code/Cost Centre, so this is a new form
 * rather than reusing the Summary tab's FilterSelect block. */
export function ExtraReportFilterBar({
  tab,
  filters,
  pipelines,
  bases,
  locations,
  cycles,
  activeCycleId,
}: {
  tab: string;
  filters: { pipeline?: string; base?: string; location?: string; cycleId?: string };
  pipelines: { id: string; code: string }[];
  bases: { id: string; name: string }[];
  locations: { id: string; code: string; name: string }[];
  cycles: { id: string; label: string }[];
  activeCycleId?: string;
}) {
  return (
    <form className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <input type="hidden" name="tab" value={tab} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Select name="pipeline" label="Pipeline" defaultValue={filters.pipeline ?? ""} options={pipelines.map((p) => ({ value: p.id, label: p.code }))} />
        <Select name="base" label="Base/LOC" defaultValue={filters.base ?? ""} options={bases.map((b) => ({ value: b.id, label: b.name }))} />
        <Select
          name="location"
          label="Operating Location"
          defaultValue={filters.location ?? ""}
          options={locations.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }))}
        />
        <Select name="cycleId" label="Financial Year" defaultValue={filters.cycleId ?? activeCycleId ?? ""} options={cycles.map((c) => ({ value: c.id, label: c.label }))} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark">
          Search
        </button>
        <a href={`/reports?tab=${tab}`} className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
          Reset
        </a>
      </div>
    </form>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-500 block mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
