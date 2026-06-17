import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserRole } from '@/lib/types'
import { Plus, Archive, ChevronRight } from 'lucide-react'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const role = profile.role as UserRole
  const canCreate = role === 'ceo' || role === 'ketoan'

  const [{ data: projects }, { data: archived }] = await Promise.all([
    supabase.from('projects').select('*').eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('projects').select('id').eq('status', 'archived'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Công trình</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {projects?.length ?? 0} công trình đang hoạt động
            {(archived?.length ?? 0) > 0 && ` · ${archived?.length} đã lưu trữ`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/projects/archived"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Archive size={14} />
            Lưu trữ
          </Link>
          {canCreate && (
            <Link
              href="/projects/new"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Plus size={14} />
              Tạo công trình
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!projects?.length ? (
          <div className="text-center py-16 text-sm text-gray-400">
            <Building2Icon />
            <p className="mt-3">Chưa có công trình nào đang hoạt động.</p>
            {canCreate && (
              <Link href="/projects/new" className="mt-3 inline-block text-blue-600 hover:underline font-medium">
                + Tạo công trình đầu tiên
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 group"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 group-hover:text-blue-600 truncate">{p.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">{p.customer_name}{p.address ? ` · ${p.address}` : ''}</p>
                  {(p.start_date || p.end_date) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.start_date ? `Bắt đầu: ${new Date(p.start_date).toLocaleDateString('vi-VN')}` : ''}
                      {p.end_date ? ` · Kết thúc: ${new Date(p.end_date).toLocaleDateString('vi-VN')}` : ''}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0 ml-4" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Building2Icon() {
  return (
    <svg className="w-10 h-10 text-gray-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}
