export default function ProjectsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-5 w-28 bg-gray-200 rounded" />
          <div className="h-4 w-40 bg-gray-100 rounded mt-1.5" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 bg-gray-100 rounded-lg" />
          <div className="h-8 w-32 bg-blue-100 rounded-lg" />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <div className="h-4 w-48 bg-gray-200 rounded mb-1.5" />
              <div className="h-3 w-36 bg-gray-100 rounded" />
            </div>
            <div className="w-4 h-4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
