import { VisitMapPageClient } from "./visit-map-page-client";
import { todayInLondon } from "@/lib/visit-map";

export default function VisitMapPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Visit map</h1>
        <p className="mt-1 text-sm text-slate-600">
          Daily visit locations for your agency. Static map only — no live carer
          tracking.
        </p>
      </header>
      <VisitMapPageClient initialDate={todayInLondon()} />
    </div>
  );
}
