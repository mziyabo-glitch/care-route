export function ConfidentialBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
      Confidential
    </span>
  );
}

export function RestrictedAccessBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
      Restricted access
    </span>
  );
}

export function ConfidentialityNotice({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 ${className}`}
    >
      Use confidential sections only when necessary. Restricted content is visible to
      managers and administrators only. Do not copy sensitive information into general
      visit notes or dashboards.
    </p>
  );
}
