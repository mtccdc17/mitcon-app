'use client'

import { useRouter } from 'next/navigation'
import { Filter } from 'lucide-react'

export type ProjectView = 'active' | 'archived' | 'all'

interface Props {
  view: ProjectView
  // Danh sách gọn để nhảy nhanh tới 1 công trình cụ thể (mọi trạng thái)
  allProjects: { id: string; name: string; status: string }[]
}

const VIEW_LABEL: Record<ProjectView, string> = {
  active: 'Đang chạy & đã hoàn thành',
  archived: 'Đã lưu trữ',
  all: 'Tất cả công trình',
}

export default function ProjectsFilter({ view, allProjects }: Props) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Filter size={14} />
      </div>

      {/* Chọn dạng công trình cần xem */}
      <select
        value={view}
        onChange={(e) => {
          const v = e.target.value as ProjectView
          router.push(v === 'active' ? '/projects' : `/projects?view=${v}`)
        }}
        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        {(Object.keys(VIEW_LABEL) as ProjectView[]).map((v) => (
          <option key={v} value={v}>{VIEW_LABEL[v]}</option>
        ))}
      </select>

      {/* Nhảy nhanh tới 1 công trình cụ thể */}
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) router.push(`/projects/${e.target.value}`)
        }}
        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-100 max-w-[220px]"
      >
        <option value="">— Chọn công trình cần xem —</option>
        {allProjects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.status === 'archived' ? ' (lưu trữ)' : p.status === 'completed' ? ' (hoàn thành)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
