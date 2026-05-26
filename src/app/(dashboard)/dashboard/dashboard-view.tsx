import Link from "next/link";
import {
  displayStatusLabel,
  formatUkTime,
  pinColor,
} from "@/lib/visit-map";
import {
  formatDashboardMinutes,
  type DashboardData,
  type DashboardActionItem,
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
  return CARE_STATUS_LABELS[status] ?? displayStatusLabel(status as Parameters<typeof displayStatusLabel>[0]);
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

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "ok";
}) {
  const valueTone =
    tone === "danger"
      ? "text-red-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
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
          ? "rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5"
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
                : "text-lg font-semibold text-slate-900"
            }
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              className={`mt-0.5 text-sm ${variant === "urgent" ? "text-amber-900/80" : "text-slate-600"}`}
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
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
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

export function DashboardView({ data }: { data: DashboardData }) {
  const { safety } = data;
  const hasNeedsAction = data.needsAction.length > 0;

  return (
    <div className="space-y-8 pb-10 sm:space-y-10">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-5 py-7 text-white shadow-md sm:px-8 sm:py-9">
        <div className="relative z-10 max-w-3xl space-y-2 sm:space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-200/90 sm:text-sm">
            Care Control Centre
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            {data.agencyName}
          </h1>
          <p className="text-base text-slate-100 sm:text-lg">
            Good {hourGreeting()}, {data.greetingName}
          </p>
          <p className="text-sm text-slate-300">{data.todayFormatted}</p>
          <p
            className={`text-sm font-medium sm:text-base ${
              hasNeedsAction ? "text-amber-200" : "text-teal-100"
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

      {/* Today's safety status */}
      <Section
        title="Today's safety status"
        subtitle="Live operational picture for today's rota (UK time)."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Visits today" value={safety.visitsToday} />
          <StatCard label="Completed" value={safety.completed} tone="ok" />
          <StatCard
            label="Still to deliver"
            value={safety.upcomingOrInProgress}
            hint="Scheduled, due, in progress, or late"
          />
          <StatCard
            label="Late"
            value={safety.late}
            tone={safety.late > 0 ? "warn" : "default"}
            hint="Past start, no check-in"
          />
          <StatCard
            label="Missed"
            value={safety.missed}
            tone={safety.missed > 0 ? "danger" : "default"}
          />
          <StatCard
            label="Notes outstanding"
            value={safety.completedWithoutNotes}
            tone={safety.completedWithoutNotes > 0 ? "warn" : "default"}
            hint="Finished visits without a care note"
          />
        </div>
      </Section>

      {/* Needs action */}
      <Section
        title="Needs action"
        subtitle="Prioritised follow-up: missed and late visits, open check-ins, missing notes, double-up gaps."
        variant={hasNeedsAction ? "urgent" : "default"}
        action={
          <Link
            href="/compliance"
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Open compliance →
          </Link>
        }
      >
        {!hasNeedsAction ? (
          <EmptyState message="No urgent follow-up items for today's rota." />
        ) : (
          <ul className="space-y-3">
            {data.needsAction.map((item) => (
              <li key={item.id}>
                <ActionCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Happening now / Up next */}
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <Section
          title="Happening now"
          subtitle="In progress, late, or due within the hour — morning, lunch, tea, or bedtime calls only."
        >
          {data.happeningNow.length === 0 ? (
            <EmptyState message="No active visits in the current call windows." />
          ) : (
            <TimelineList items={data.happeningNow} />
          )}
        </Section>
        <Section
          title="Up next"
          subtitle="Later today within a call window — not yet started."
        >
          {data.upNext.length === 0 ? (
            <EmptyState message="No further visits in today's call windows." />
          ) : (
            <TimelineList items={data.upNext} />
          )}
        </Section>
      </div>

      {/* Rota capacity */}
      <Section
        title="Rota capacity"
        subtitle="Carers with at least one visit scheduled today."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active carers" value={data.rotaCapacity.totalCarers} />
          <StatCard
            label="On today's rota"
            value={data.rotaCapacity.assignedToday}
          />
          <StatCard
            label="Unassigned today"
            value={data.rotaCapacity.spare}
            hint="Active carers with no visit today"
          />
          <StatCard
            label="Double-up visits"
            value={data.rotaCapacity.doubleUpCount}
            hint="Joint or two-carer calls today"
          />
        </div>
        {data.rotaCapacity.busiestCarers.length > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Busiest on today's rota
            </p>
            <ul className="mt-2 divide-y divide-slate-100">
              {data.rotaCapacity.busiestCarers.map((c) => (
                <li
                  key={c.name}
                  className="flex justify-between py-2 text-sm text-slate-700 first:pt-0 last:pb-0"
                >
                  <span>{c.name}</span>
                  <span className="tabular-nums text-slate-500">
                    {c.visitCount} visits
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-3">
          <Link
            href="/rota"
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Open rota →
          </Link>
        </p>
      </Section>

      {/* Compliance pulse */}
      <Section
        title="Compliance pulse"
        subtitle="Signals from today's visits — no placeholder KPIs."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.compliancePulse.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-700">{m.label}</p>
              {m.tracked ? (
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
                  {m.value ?? 0}
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Not tracked yet — planned in a future release
                </p>
              )}
              {m.href && m.tracked ? (
                <Link
                  href={m.href}
                  className="mt-2 inline-block text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  View details →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      {/* Payroll / billing */}
      {data.payrollBilling.visible ? (
        <Section
          title="Payroll & billing snapshot"
          subtitle="Today only — completed hours and billable time; payroll reflects checked-in work, not future slots."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Completed hours (today)
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {formatDashboardMinutes(data.payrollBilling.completedMinutes)}
              </p>
            </div>
            {data.payrollBilling.payrollVisible ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Worked hours (today)
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatDashboardMinutes(data.payrollBilling.payrollMinutes)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Completed and checked-in visits only
                </p>
              </div>
            ) : null}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Billable (today)
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {formatDashboardMinutes(data.payrollBilling.billableMinutes)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Missed visits (today)
              </p>
              <p className="mt-1 text-xl font-semibold text-red-700">
                {data.payrollBilling.missedVisits}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {data.payrollBilling.payrollVisible ? (
              <Link
                href="/payroll"
                className="font-medium text-teal-700 hover:text-teal-800"
              >
                Payroll →
              </Link>
            ) : null}
            <Link
              href="/billing/summary"
              className="font-medium text-teal-700 hover:text-teal-800"
            >
              Billing summary →
            </Link>
          </div>
        </Section>
      ) : null}

      {/* Visit map preview */}
      {data.visitMapPreview.visible ? (
        <Section
          title="Visit map preview"
          subtitle={`${data.visitMapPreview.geocodedCount} of ${safety.visitsToday} visits today have map coordinates.`}
          action={
            <Link
              href={`/visit-map?date=${data.todayDate}`}
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              Full map →
            </Link>
          }
        >
          <div className="mb-3 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500"
                aria-hidden
              />
              {data.visitMapPreview.lateCount} late
            </span>
            <span>
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-600"
                aria-hidden
              />
              {data.visitMapPreview.missedCount} missed
            </span>
          </div>
          {data.visitMapPreview.rows.length === 0 ? (
            <EmptyState message="No visits on today's rota." />
          ) : (
            <ul className="space-y-2">
              {data.visitMapPreview.rows.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {v.client_name}
                    </p>
                    <p className="text-slate-500">
                      {formatUkTime(v.start_time)}
                      {v.carer_names[0] ? ` · ${v.carer_names[0]}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {v.client_lat != null && v.client_lng != null ? (
                      <span className="text-xs text-slate-500">On map</span>
                    ) : (
                      <span className="text-xs text-amber-700">No coords</span>
                    )}
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: pinColor(v.display_status) }}
                      title={careStatusLabel(v.display_status)}
                      aria-hidden
                    />
                    <StatusBadge status={v.display_status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {/* Quick links */}
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
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function ActionCard({ item }: { item: DashboardActionItem }) {
  return (
    <Link
      href={item.href}
      className={`block rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md ${actionAccent(item.priority)}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{item.clientName}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {formatUkTime(item.startTime)} – {formatUkTime(item.endTime)}
          </p>
          <p className="mt-1 text-sm text-slate-700">{item.taskLabel}</p>
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
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
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
              <p className="mt-1 text-sm text-slate-700">{item.taskLabel}</p>
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
