import Link from "next/link";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <nav
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
        aria-label="Settings"
      >
        <Link
          href="/settings"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          General
        </Link>
        <Link
          href="/settings/members"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          Team &amp; members
        </Link>
      </nav>
      {children}
    </div>
  );
}
