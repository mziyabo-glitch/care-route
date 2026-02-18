export default function VisitsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-24 rounded bg-gray-200" />
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-10 w-28 rounded bg-gray-200" />
        <ul className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <li key={i} className="flex gap-4">
              <div className="h-5 flex-1 rounded bg-gray-100" />
              <div className="h-6 w-20 rounded bg-gray-100" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
