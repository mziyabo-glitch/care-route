type BadgeTone = "neutral" | "amber" | "orange" | "red" | "emerald" | "blue";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  amber: "bg-amber-100 text-amber-900",
  orange: "bg-orange-100 text-orange-900",
  red: "bg-red-100 text-red-800",
  emerald: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
};

export function AuditBadge({
  label,
  tone = "neutral",
  title,
}: {
  label: string;
  tone?: BadgeTone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

export type VisitAuditBadgeFlags = {
  carePlanPresent?: boolean;
  missingNotes?: boolean;
  lateVisit?: boolean;
  gpsMismatch?: boolean;
  missedVisit?: boolean;
  doubleUpGap?: boolean;
};

export function VisitAuditBadges({
  flags,
  className = "",
}: {
  flags: VisitAuditBadgeFlags;
  className?: string;
}) {
  const items: { show: boolean; label: string; tone: BadgeTone; title?: string }[] =
    [
      {
        show: flags.carePlanPresent === true,
        label: "Care plan",
        tone: "emerald",
        title: "Active care plan on file",
      },
      {
        show: !!flags.missingNotes,
        label: "Notes missing",
        tone: "amber",
      },
      {
        show: !!flags.lateVisit,
        label: "Late visit",
        tone: "orange",
      },
      {
        show: !!flags.gpsMismatch,
        label: "GPS mismatch",
        tone: "orange",
        title: "Check-in location far from client address",
      },
      {
        show: !!flags.missedVisit,
        label: "Missed visit",
        tone: "red",
      },
      {
        show: !!flags.doubleUpGap,
        label: "Double-up",
        tone: "red",
        title: "Second carer required but not assigned",
      },
    ];

  const visible = items.filter((i) => i.show);
  if (visible.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {visible.map((i) => (
        <AuditBadge key={i.label} label={i.label} tone={i.tone} title={i.title} />
      ))}
    </div>
  );
}
