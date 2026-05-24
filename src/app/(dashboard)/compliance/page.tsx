import { CompliancePageClient } from "./compliance-page-client";
import { defaultComplianceDateRange } from "@/lib/compliance-data";

export default function CompliancePage() {
  const { start, end } = defaultComplianceDateRange();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Compliance</h1>
        <p className="mt-1 text-sm text-slate-600">
          Missed visits and completed visits without care notes for your agency.
        </p>
      </header>
      <CompliancePageClient initialStart={start} initialEnd={end} />
    </div>
  );
}
