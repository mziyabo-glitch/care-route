import Link from "next/link";
import {
  displayStatusLabel,
  formatUkTime,
  pinColor,
} from "@/lib/visit-map";
import {
  formatDashboardMinutes,
  type DashboardData,
} from "@/lib/dashboard-data";

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const styles: Record<string, string> = {
    missed: "bg-red-50 text-red-800 ring-red-200",
    late: "bg-amber-50 text-amber-900 ring-amber-200",
    in_progress: "bg-violet-50 text-violet-800 ring-violet-200",
    completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    scheduled: "bg-blue-50 text-blue-800 ring-blue-200",
    due_soon: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  };
  const cls =
    styles[status] ?? "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${cls}`}
    >
      {displayStatusLabel(status as Parameters<typeof displayStatusLabel>[0])}
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
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

export function DashboardView({ data }: { data: DashboardData }) {
  const { safety } = data;

  return (
    <div className="space-y-10 pb-10">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-6 py-8 text-white shadow-md sm:px-8">
        <div className="relative z-10 max-w-2xl space-y-3">
          <p className="text-sm font-medium text-teal-200/90">
            Care Control Centre
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Good {hourGreeting()}, {data.greetingName}
          </h1>
          <p className="text-lg text-slate-200">{data.agencyName}</p>
          <p className="text-sm text-slate-300">{data.todayFormatted}</p>
          <p className="text-sm font-medium text-white/90">
            {data.operationalLine}
          </p>
        </div>
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-teal-500/20 blur-2xl"
          aria-hidden
        />
      </header>

      {/* Today's Safety Status */}
      <Section
        title="Today's safety status"
        subtitle="Operational picture for today's rota (Europe/London)."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Visits today" value={safety.visitsToday} />
          <StatCard label="Completed" value={safety.completed} tone="ok" />
          <StatCard
            label="Upcoming / in progress"
            value={safety.upcomingOrInProgress}
          />
          <StatCard
            label="Late"
            value={safety.late}
            tone={safety.late > 0 ? "warn" : "default"}
          />
          <StatCard
            label="Missed"
            value={safety.missed}
            tone={safety.missed > 0 ? "danger" : "default"}
          />
          <StatCard
            label="No care notes"
            value={safety.completedWithoutNotes}
            tone={safety.completedWithoutNotes > 0 ? "warn" : "default"}
            hint="Completed or checked out"
          />
        </div>
      </Section>

      {/* Needs Action */}
      <Section
        title="Needs action"
        subtitle="Prioritised: missed, late, checked-in without checkout, missing notes, double-up gaps."
        action={
          <Link
            href="/compliance"
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Compliance →
          </Link>
        }
      >
        {data.needsAction.length === 0 ? (
          <EmptyState message="Nothing flagged for urgent follow-up right now." />
        ) : (
          <ul className="space-y-3">
            {data.needsAction.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {item.clientName}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {formatUkTime(item.startTime)} –{" "}
                        {formatUkTime(item.endTime)}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {item.taskLabel}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.carerNames.length > 0
                          ? item.carerNames.join(" · ")
                          : "Unassigned"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs font-medium text-amber-800">
                        {item.reason}
                      </span>
                      <StatusBadge status={item.displayStatus} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Happening Now / Next */}
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Happening now" subtitle="In progress or due within the hour.">
          {data.happeningNow.length === 0 ? (
            <EmptyState message="No visits in progress or imminently due." />
          ) : (
            <TimelineList items={data.happeningNow} />
          )}
        </Section>
        <Section title="Up next" subtitle="Scheduled visits later today.">
          {data.upNext.length === 0 ? (
            <EmptyState message="No further visits scheduled for today." />
          ) : (
            <TimelineList items={data.upNext} />
          )}
        </Section>
      </div>

      {/* Rota Capacity */}
      <Section
        title="Rota capacity"
        subtitle="Carers assigned to at least one visit today."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active carers"
            value={data.rotaCapacity.totalCarers}
          />
          <StatCard
            label="Assigned today"
            value={data.rotaCapacity.assignedToday}
          />
          <StatCard label="Spare capacity" value={data.rotaCapacity.spare} />
          <StatCard
            label="Double-up visits"
            value={data.rotaCapacity.doubleUpCount}
          />
        </div>
        {data.rotaCapacity.busiestCarers.length > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Busiest carers today
            </p>
            <ul className="mt-2 space-y-1">
              {data.rotaCapacity.busiestCarers.map((c) => (
                <li
                  key={c.name}
                  className="flex justify-between text-sm text-slate-700"
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

      {/* Compliance Pulse */}
      <Section
        title="Compliance pulse"
        subtitle="Signals your agency already tracks — no placeholder metrics."
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
                <p className="mt-2 text-sm text-slate-500">Not tracked yet</p>
              )}
              {m.href && m.tracked ? (
                <Link
                  href={m.href}
                  className="mt-2 inline-block text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  View details
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      {/* Payroll / Billing */}
      {data.payrollBilling.visible ? (
        <Section
          title="Payroll & billing snapshot"
          subtitle="Today only — same rules as timesheet generation and visit billing views."
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
                  Payroll hours (today)
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatDashboardMinutes(data.payrollBilling.payrollMinutes)}
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

      {/* Visit Map Preview */}
      {data.visitMapPreview.visible ? (
        <Section
          title="Visit map preview"
          subtitle={`${data.visitMapPreview.geocodedCount} geocoded of ${data.safety.visitsToday} visits today.`}
          action={
            <Link
              href={`/visit-map?date=${data.todayDate}`}
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              Full map →
            </Link>
          }
        >
          <div className="mb-3 flex flex-wrap gap-3 text-sm text-slate-600">
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
            <EmptyState message="No visits scheduled for today." />
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
                      title={displayStatusLabel(v.display_status)}
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
            <div>
              <p className="font-semibold text-slate-900">{item.clientName}</p>
              <p className="text-sm text-slate-600">
                {formatUkTime(item.startTime)} ·{" "}
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
