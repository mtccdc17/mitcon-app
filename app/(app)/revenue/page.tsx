import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect } from 'next/navigation'
import { UserRole } from '@/lib/types'
import { formatVND, formatVNDShort } from '@/lib/utils'

export default async function RevenuePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const role = profile.role as UserRole
  const isCeo = role === 'ceo'

  const { data: revenue } = await supabase
    .from('revenue')
    .select('*, projects(name)')
    .order('created_at', { ascending: false })

  const rows = revenue ?? []

  const totalCollected = rows.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
  const totalPending = rows.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Doanh thu</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tình hình thu tiền từ khách hàng theo từng công trình
        </p>
      </div>

      {/* Summary - CEO only sees full amounts */}
      {isCeo && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <p className="text-xs text-green-700 font-medium">Đã thu</p>
            <p className="text-xl font-bold text-green-800 mt-1">{formatVNDShort(totalCollected)}</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
            <p className="text-xs text-orange-700 font-medium">Chưa thu</p>
            <p className="text-xl font-bold text-orange-800 mt-1">{formatVNDShort(totalPending)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">Chi tiết thu tiền</h2>
          {!isCeo && (
            <p className="text-xs text-gray-400 mt-0.5">Số tiền và ngày thu được ẩn theo phân quyền.</p>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Chưa có dữ liệu doanh thu.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Công trình</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Đợt</th>
                  {isCeo && (
                    <>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Số tiền</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Ngày thu</th>
                    </>
                  )}
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Trạng thái</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Hình thức</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {(r.projects as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{r.stage}</td>
                    {isCeo && (
                      <>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">{formatVND(r.amount)}</td>
                        <td className="px-5 py-3 text-gray-600">
                          {r.collected_date ? new Date(r.collected_date).toLocaleDateString('vi-VN') : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'collected'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {r.status === 'collected' ? 'Đã thu' : 'Chưa thu'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden md:table-cell">{r.payment_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
