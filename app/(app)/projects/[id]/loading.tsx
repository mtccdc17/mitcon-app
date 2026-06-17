export default function ProjectDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 bg-gray-200 rounded" />
        <div className="h-5 w-48 bg-gray-200 rounded" />
        <div className="h-5 w-16 bg-green-100 rounded-full ml-auto" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="h-3 w-20 bg-gray-100 rounded mb-2" />
            <div className="h-5 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-7 w-28 bg-blue-100 rounded-lg" />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="px-5 py-3 border-b border-gray-100 flex gap-4">
            <div className="h-4 w-32 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
