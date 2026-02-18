export default function RotaLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between">
        <div className="h-7 w-20 rounded bg-gray-200" />
        <div className="h-10 w-64 rounded bg-gray-200" />
      </div>
      <div className="h-96 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}
