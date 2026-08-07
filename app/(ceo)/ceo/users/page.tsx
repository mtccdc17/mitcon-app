import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ROLE_LABEL, NAV_ITEMS } from '@/lib/navConfig'
import { UserRole } from '@/lib/types'
import { Users } from 'lucide-react'

const ROLE_COLOR: Record<UserRole, string> = {
  ceo: 'bg-purple-100 text-purple-700',
  ketoan: 'bg-green-100 text-green-700',
  thicong: 'bg-orange-100 text-orange-700',
  thumua: 'bg-blue-100 text-blue-700',
  nhansu: 'bg-pink-100 text-pink-700',
}

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!myProfile || myProfile.role !== 'ceo') redirect('/dashboard')

  // RLS trên profiles chỉ cho mỗi người đọc đúng dòng của mình (auth.uid()=id) — để CEO xem
  // được TOÀN BỘ tài khoản phải dùng client admin (service role), bypass RLS. Xem thêm pattern
  // tương tự ở app/api/transactions/[id]/route.ts.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: allProfiles } = await admin
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .order('created_at', { ascending: true })

  const profiles = allProfiles ?? []
  const countByRole = profiles.reduce((acc, p) => {
    acc[p.role as UserRole] = (acc[p.role as UserRole] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  function accessiblePages(role: UserRole) {
    return NAV_ITEMS.filter(item => (item.roles as readonly string[]).includes(role))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Users size={20} className="text-gray-500" /> Quản lý tài khoản
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tổng <strong>{profiles.length}</strong> tài khoản đang vào được app.
        </p>
      </div>

      {/* Tóm tắt theo vai trò */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(ROLE_LABEL).map(([role, label]) => (
          <span key={role} className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLOR[role as UserRole]}`}>
            {label}: {countByRole[role] ?? 0}
          </span>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-8">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Họ tên</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Vai trò</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Quyền truy cập</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-14 text-gray-400 text-sm">Chưa có tài khoản nào.</td>
                </tr>
              ) : profiles.map((p, idx) => {
                const role = p.role as UserRole
                const pages = accessiblePages(role)
                return (
                  <tr key={p.id} className="hover:bg-gray-50/40">
                    <td className="px-4 py-3.5 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3.5 font-medium text-gray-900">{p.full_name}</td>
                    <td className="px-4 py-3.5 text-gray-500">{p.email}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABEL[role] ?? role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {pages.length === 0 ? (
                          <span className="text-xs text-gray-300">— Không có trang nào —</span>
                        ) : pages.map(page => (
                          <span key={page.href} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {page.label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
