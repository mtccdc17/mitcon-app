import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ArrowLeft } from 'lucide-react'

export default async function ArchivedProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'archived')
    .order('archived_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Công trình đã lưu trữ</h1>
          <p className="text-sm text-gray-500 mt-0.5">{projects?.length ?? 0} công trình đã hoàn thành</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!projects?.length ? (
          <div className="text-center py-12 text-sm text-gray-400">Chưa có công trình lưu trữ.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-700 group-hover:text-blue-600 truncate">{p.name}</p>
                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Lưu trữ</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{p.customer_name}</p>
                  {p.archived_at && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Lưu trữ: {new Date(p.archived_at).toLocaleDateString('vi-VN')}
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
