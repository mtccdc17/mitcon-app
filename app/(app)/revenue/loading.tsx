export default function RevenueLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-32 bg-gray-200 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="h-3 w-20 bg-gray-100 rounded mb-2" />
            <div className="h-5 w-28 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-4 w-24 bg-gray-200 rounded" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-5 py-3 border-b border-gray-100 flex gap-4">
            <div className="h-4 w-36 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
