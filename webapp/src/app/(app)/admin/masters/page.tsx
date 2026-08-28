import { MasterTabs } from "./MasterTabs";
import { LocationsTab } from "./LocationsTab";
import { FundsTab } from "./FundsTab";
import { RatesUomTab } from "./RatesUomTab";
import { EmployeesTab } from "./EmployeesTab";
import { RolesTab } from "./RolesTab";
import { ActualsTab } from "./ActualsTab";
import { AuditTrailTab } from "./AuditTrailTab";
import { SettingsTab } from "./SettingsTab";

export default async function MastersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "locations" } = await searchParams;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Masters</h2>
        <p className="mt-1 text-sm text-stone-500">
          Reference data, Finance actuals upload, audit trail, and budget cycle settings.
        </p>
      </div>

      <MasterTabs />

      {tab === "locations" && <LocationsTab />}
      {tab === "funds" && <FundsTab />}
      {tab === "rates-uom" && <RatesUomTab />}
      {tab === "employees" && <EmployeesTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "actuals" && <ActualsTab />}
      {tab === "audit" && <AuditTrailTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}
