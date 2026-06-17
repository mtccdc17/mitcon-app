export default function InvoicesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded" />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-5 py-3 border-b border-gray-100 flex gap-4 items-center">
            <div className="h-4 w-28 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-5 w-16 bg-gray-100 rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
