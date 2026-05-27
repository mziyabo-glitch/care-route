import Link from "next/link";
import {
  displayStatusLabel,
  formatUkTime,
} from "@/lib/visit-map";
import {
  type DashboardActionItem,
  type DashboardCqcCategoryCard,
  type DashboardData,
} from "@/lib/dashboard-data";

const CARE_STATUS_LABELS: Record<string, string> = {
  missed: "Missed visit",
  late: "Late — not checked in",
  in_progress: "In progress",
  completed: "Completed",
  scheduled: "Scheduled",
  due_soon: "Due soon",
};

function careStatusLabel(status: string): string {
  return (
    CARE_STATUS_LABELS[status] ??
    displayStatusLabel(status as Parameters<typeof displayStatusLabel>[0])
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    missed: "bg-red-50 text-red-800 ring-red-200",
    late: "bg-amber-50 text-amber-900 ring-amber-200",
    in_progress: "bg-violet-50 text-violet-800 ring-violet-200",
    completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    scheduled: "bg-blue-50 text-blue-800 ring-blue-200",
    due_soon: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  };
  const cls = styles[status] ?? "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {careStatusLabel(status)}
    </span>
  );
}

type StatTone = "default" | "warn" | "danger" | "ok" | "muted";

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: StatTone;
}) {
  const valueTone =
    tone === "danger"
      ? "text-red-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "ok"
          ? "text-emerald-700"
          : tone === "muted"
            ? "text-slate-500"
            : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

function statToneForCount(
  count: number,
  levels: { warn?: number; danger?: number }
): StatTone {
  if (count === 0) return "default";
  if (levels.danger != null && count >= levels.danger) return "danger";
  if (levels.warn != null && count >= levels.warn) return "warn";
  return count > 0 ? "warn" : "default";
}

function Section({
  title,
  subtitle,
  children,
  action,
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  variant?: "default" | "urgent";
}) {
  return (
    <section
      className={
        variant === "urgent"
          ? "rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/60 to-white p-4 shadow-sm sm:p-5"
          : "space-y-4"
      }
    >
      <div
        className={`flex flex-wrap items-end justify-between gap-2 ${variant === "urgent" ? "mb-4" : ""}`}
      >
        <div>
          <h2
            className={
              variant === "urgent"
                ? "text-lg font-semibold text-amber-950"
                : "text-lg font-semibold tracking-tight text-slate-900"
            }
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              className={`mt-0.5 max-w-2xl text-sm leading-relaxed ${variant === "urgent" ? "text-amber-900/80" : "text-slate-600"}`}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
      {message}
    </div>
  );
}

function actionAccent(priority: number): string {
  if (priority <= 1) return "border-l-red-600";
  if (priority <= 2) return "border-l-amber-500";
  return "border-l-slate-300";
}

function ActionReasonBadge({ reason }: { reason: string }) {
  const urgent =
    reason.toLowerCase().includes("missed") ||
    reason.toLowerCase().includes("late");
  return (
    <span
      className={`inline-flex max-w-[12rem] rounded-md px-2 py-1 text-xs font-semibold leading-snug sm:max-w-none ${
        urgent
          ? "bg-red-100 text-red-900"
          : "bg-amber-100 text-amber-950"
      }`}
    >
      {reason}
    </span>
  );
}

function CqcCategoryCard({ card }: { card: DashboardCqcCategoryCard }) {
  const needsAttention =
    card.highRiskOpen > 0 || card.overdue > 0 || card.open > 0;
  const tone =
    card.highRiskOpen > 0
      ? "border-red-200 bg-red-50/40"
      : card.overdue > 0
        ? "border-amber-200 bg-amber-50/30"
        : card.open > 0
          ? "border-slate-200 bg-white"
          : "border-emerald-200/80 bg-emerald-50/20";

  return (
    <Link
      href="/compliance"
      className={`block rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${tone}`}
    >
      <p className="text-sm font-semibold text-slate-900">{card.label}</p>
      {needsAttention ? (
        <dl className="mt-3 space-y-1 text-xs text-slate-600">
          <div className="flex justify-between gap-2">
            <dt>Open</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{card.open}</dd>
          </div>
          {card.overdue > 0 ? (
            <div className="flex justify-between gap-2">
              <dt>Overdue</dt>
              <dd className="font-semibold tabular-nums text-amber-800">{card.overdue}</dd>
            </div>
          ) : null}
          {card.highRiskOpen > 0 ? (
            <div className="flex justify-between gap-2">
              <dt>High risk open</dt>
              <dd className="font-semibold tabular-nums text-red-700">{card.highRiskOpen}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-emerald-800">No open items</p>
      )}
    </Link>
  );
}

export function DashboardView({ data }: { data: DashboardData }) {
  const { safety } = data;
  const hasPriority = data.priorityActions.length > 0;
  const lateOrMissed = safety.late + safety.missed;

  return (
    <div className="space-y-8 pb-12 sm:space-y-10">
      {/* A. Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-5 py-7 text-white shadow-md sm:px-8 sm:py-9">
        <div className="relative z-10 max-w-3xl space-y-2 sm:space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-200/90 sm:text-sm">
            Care Control Centre
          </p>
          <p className="text-sm text-slate-300 sm:text-base">{data.todayFormatted}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Good {hourGreeting()}, {data.greetingName}
          </h1>
          <p className="text-base text-teal-100 sm:text-lg">{data.agencyName}</p>
          <p
            className={`text-sm font-medium leading-relaxed sm:text-base ${
              hasPriority ? "text-amber-200" : "text-teal-100"
            }`}
          >
            {data.operationalLine}
          </p>
        </div>
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-teal-500/20 blur-2xl"
          aria-hidden
        />
      </header>

      {/* B. Today's safety status */}
      <Section
        title="Today's safety status"
        subtitle="Operational picture for today's rota — UK time, live from your visits."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Visits today" value={safety.visitsToday} />
          <StatCard label="Completed" value={safety.completed} tone="ok" />
          <StatCard
            label="Late or missed"
            value={lateOrMissed}
            tone={statToneForCount(lateOrMissed, { warn: 1 })}
            hint={
              safety.late > 0 || safety.missed > 0
                ? `${safety.late} late · ${safety.missed} missed`
                : "No late or missed visits"
            }
          />
          <StatCard
            label="Missing notes"
            value={safety.completedWithoutNotes}
            tone={statToneForCount(safety.completedWithoutNotes, { warn: 1 })}
            hint="Finished visits without a care note"
          />
          {data.carePlanReviews.visible ? (
            <StatCard
              label="Care plans overdue"
              value={safety.carePlansOverdue}
              tone={statToneForCount(safety.carePlansOverdue, { warn: 1 })}
              hint="Active plans past review date"
            />
          ) : null}
          {data.cqcReadiness.visible ? (
            <StatCard
              label="High-risk CQC open"
              value={safety.highRiskCqcOpen}
              tone={statToneForCount(safety.highRiskCqcOpen, { warn: 1 })}
              hint="Open evidence items marked high risk"
            />
          ) : null}
        </div>
      </Section>

      {/* C. Priority actions */}
      <Section
        title="Priority actions"
        subtitle="Top five follow-ups for today — names and times only; no confidential note text."
        variant={hasPriority ? "urgent" : "default"}
        action={
          data.cqcReadiness.visible ? (
            <Link
              href="/compliance"
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              Compliance →
            </Link>
          ) : null
        }
      >
        {!hasPriority ? (
          <EmptyState message="No priority follow-ups for today's rota." />
        ) : (
          <ul className="space-y-3">
            {data.priorityActions.map((item) => (
              <li key={item.id}>
                <ActionCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* D. Happening now / Up next / Later today */}
      <Section
        title="Happening now / Up next"
        subtitle="Now, next, and later today within UK call windows — morning, lunch, tea, or bedtime."
      >
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-5">
          <TimelineColumn
            title="Now"
            emptyMessage="Nothing active in the current call windows."
            items={data.happeningNow}
          />
          <TimelineColumn
            title="Next"
            emptyMessage="No upcoming visits in the next slots."
            items={data.upNext}
          />
          <TimelineColumn
            title="Later today"
            emptyMessage="No further visits scheduled later today."
            items={data.laterToday}
          />
        </div>
        <p className="pt-1">
          <Link
            href="/visits"
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Open visits →
          </Link>
        </p>
      </Section>

      {/* E. CQC readiness */}
      {data.cqcReadiness.visible ? (
        <Section
          title="CQC readiness"
          subtitle="Evidence register by key question — counts only, no sensitive descriptions on this page."
          action={
            <Link
              href="/compliance"
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              Evidence register →
            </Link>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {data.cqcReadiness.categories.map((card) => (
              <CqcCategoryCard key={card.category} card={card} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* F. Care plan reviews */}
      {data.carePlanReviews.visible ? (
        <Section
          title="Care plan reviews"
          subtitle="Review due dates for active plans — no plan section text on the dashboard."
          action={
            <Link
              href="/compliance"
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              Overdue on compliance →
            </Link>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Overdue"
              value={data.carePlanReviews.overdue}
              tone={statToneForCount(data.carePlanReviews.overdue, { warn: 1 })}
            />
            <StatCard
              label="Due this week"
              value={data.carePlanReviews.dueThisWeek}
              tone={
                data.carePlanReviews.dueThisWeek > 0 ? "warn" : "default"
              }
            />
            <StatCard
              label="Up to date"
              value={data.carePlanReviews.upToDate}
              tone="ok"
              hint="Review due after this week"
            />
          </div>
          {data.carePlanReviews.topOverdue.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Most overdue
              </p>
              <ul className="mt-2 divide-y divide-slate-100">
                {data.carePlanReviews.topOverdue.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={`/clients/${p.client_id}/care-plan`}
                      className="font-medium text-teal-800 hover:text-teal-900"
                    >
                      {p.client_name}
                    </Link>
                    <span className="text-sm text-amber-800">
                      Due {formatUkDate(p.review_due_date)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No overdue care plan reviews.</p>
          )}
        </Section>
      ) : null}

      {/* G. Confidentiality */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Confidentiality</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          This dashboard shows operational counts and follow-ups only. Care note bodies,
          confidential plan sections, and safeguarding detail stay on their dedicated pages
          with role-based access.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          <li className="flex gap-2">
            <span className="text-emerald-600" aria-hidden>
              ✓
            </span>
            <span>No care note or visit note text on this screen</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600" aria-hidden>
              ✓
            </span>
            <span>
              {data.confidentiality.restrictedSectionCount === 0
                ? "No restricted care plan sections in your agency"
                : `${data.confidentiality.restrictedSectionCount} restricted care plan section${
                    data.confidentiality.restrictedSectionCount === 1 ? "" : "s"
                  } in your agency`}
              {data.confidentiality.canViewRestricted
                ? " — visible to managers on care plans"
                : " — not shown to your role"}
            </span>
          </li>
        </ul>
      </section>

      <nav
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Quick links"
      >
        {[
          { href: "/clients", label: "Clients" },
          { href: "/carers", label: "Carers" },
          { href: "/visits", label: "Visits" },
          { href: "/rota", label: "Rota" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function TimelineColumn({
  title,
  emptyMessage,
  items,
}: {
  title: string;
  emptyMessage: string;
  items: DashboardData["happeningNow"];
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {items.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <TimelineList items={items} />
      )}
    </div>
  );
}

function ActionCard({ item }: { item: DashboardActionItem }) {
  return (
    <Link
      href={item.href}
      className={`block rounded-2xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md ${actionAccent(item.priority)}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{item.clientName}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {formatUkTime(item.startTime)} – {formatUkTime(item.endTime)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {item.carerNames.length > 0
              ? item.carerNames.join(" · ")
              : "Unassigned"}
          </p>
        </div>
        <div className="flex flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <ActionReasonBadge reason={item.reason} />
          <StatusBadge status={item.displayStatus} />
        </div>
      </div>
    </Link>
  );
}

function hourGreeting(): string {
  const h = Number(
    new Date().toLocaleString("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      hour12: false,
    })
  );
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function formatUkDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TimelineList({
  items,
}: {
  items: DashboardData["happeningNow"];
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{item.clientName}</p>
              <p className="text-sm text-slate-600">
                {formatUkTime(item.startTime)}
                {item.callWindow ? ` · ${item.callWindow} call` : ""}
              </p>
              <p className="text-sm text-slate-500">
                {item.carerNames.join(" · ") || "Unassigned"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {item.isDoubleUp ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                  Double-up
                </span>
              ) : null}
              <StatusBadge status={item.displayStatus} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
