import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserRole } from '@/lib/types'
import { formatVND } from '@/lib/utils'
import { Plus, Archive, ChevronRight } from 'lucide-react'
import CommissionTickCell from './CommissionTickCell'

export default async function ProjectsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const role = profile.role as UserRole
  const canCreate = role === 'ceo' || role === 'ketoan'
  const canSeeFinance = role === 'ceo' || role === 'ketoan' || role === 'thicong'
  const isCeo = role === 'ceo'

  const supabase = await createClient()
  const [{ data: activeAndCompleted }, { data: archived }] = await Promise.all([
    // "completed" (Đã hoàn thành) vẫn hiện ở đây — công trình xong việc vẫn cần thêm/sửa khoản chi phát sinh sau đó.
    // Chỉ "archived" (đã bấm Lưu trữ) mới tách sang trang riêng /projects/archived.
    supabase.from('projects').select('*').in('status', ['active', 'completed']).order('created_at', { ascending: false }),
    supabase.from('projects').select('id').eq('status', 'archived'),
  ])

  const projects = (activeAndCompleted ?? []).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return (b.created_at ?? '').localeCompare(a.created_at ?? '')
  })
  const completedCount = projects.filter(p => p.status === 'completed').length

  const projectIds = (projects ?? []).map((p: { id: string }) => p.id)

  // Per-project financials
  type FinMap = Map<string, { totalRevenue: number; totalProfit: number; profitPct: string }>
  let finMap: FinMap = new Map()

  if (canSeeFinance && projectIds.length > 0) {
    const [{ data: contracts }, { data: transactions }] = await Promise.all([
      supabase.from('contracts').select('id, project_id, type, value').in('project_id', projectIds),
      supabase
        .from('transactions')
        .select('contract_id, amount, vat_amount, tncn_amount, is_vat_allocation')
        .in('project_id', projectIds),
    ])

    // contract_id → { projectId, type, value }
    type ContractInfo = { projectId: string; type: string; value: number }
    const cMap = new Map<string, ContractInfo>()
    // project_id → { vatRevenue, noVatRevenue }
    const revMap = new Map<string, { vatRev: number; noVatRev: number }>()

    for (const c of contracts ?? []) {
      cMap.set(c.id, { projectId: c.project_id, type: c.type, value: c.value })
      if (!revMap.has(c.project_id)) revMap.set(c.project_id, { vatRev: 0, noVatRev: 0 })
      const rev = revMap.get(c.project_id)!
      if (c.type === 'vat') rev.vatRev = c.value
      if (c.type === 'no_vat') rev.noVatRev = c.value
    }

    // project_id → { vatCost, noVatCost }
    const costMap = new Map<string, { vatCost: number; noVatCost: number }>()
    for (const t of transactions ?? []) {
      if (t.is_vat_allocation) continue
      const ci = cMap.get(t.contract_id)
      if (!ci) continue
      if (!costMap.has(ci.projectId)) costMap.set(ci.projectId, { vatCost: 0, noVatCost: 0 })
      const cost = costMap.get(ci.projectId)!
      const netCost = t.amount - (t.vat_amount ?? 0)
      const tncn = t.tncn_amount ?? 0
      if (ci.type === 'vat') cost.vatCost += netCost + tncn
      else cost.noVatCost += netCost
    }

    for (const pid of projectIds) {
      const rev = revMap.get(pid) ?? { vatRev: 0, noVatRev: 0 }
      const vatNetRev = Math.round(rev.vatRev / 1.08)
      const noVatNetRev = rev.noVatRev
      const totalRevenue = vatNetRev + noVatNetRev
      const cost = costMap.get(pid) ?? { vatCost: 0, noVatCost: 0 }
      const vatProfit = vatNetRev - cost.vatCost
      const noVatProfit = noVatNetRev - cost.noVatCost
      const totalProfit = vatProfit + noVatProfit
      const profitPct = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '—'
      finMap.set(pid, { totalRevenue, totalProfit, profitPct })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Công trình</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {projects.length - completedCount} đang hoạt động
            {completedCount > 0 && ` · ${completedCount} đã hoàn thành`}
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

      {!projects?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-sm text-gray-400">
          <Building2Icon />
          <p className="mt-3">Chưa có công trình nào đang hoạt động.</p>
          {canCreate && (
            <Link href="/projects/new" className="mt-3 inline-block text-blue-600 hover:underline font-medium">
              + Tạo công trình đầu tiên
            </Link>
          )}
        </div>
      ) : canSeeFinance ? (
        /* Finance table view */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Tên công trình</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Khách hàng · Địa chỉ</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Tổng DT trước VAT</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Lợi nhuận</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">% LN</th>
                  {isCeo && <th className="text-center px-3 py-3 font-medium text-gray-500">Hoa hồng</th>}
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map((p: {
                  id: string; name: string; customer_name: string; address?: string;
                  start_date?: string; end_date?: string; status: string
                  commission_hieu?: boolean; commission_tan?: boolean
                }) => {
                  const fin = finMap.get(p.id)
                  const profit = fin?.totalProfit ?? 0
                  return (
                    <tr key={p.id} className="hover:bg-blue-50/40 group">
                      <td className="p-0">
                        <Link href={`/projects/${p.id}`} className="block px-5 py-4">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 group-hover:text-blue-600">{p.name}</p>
                            {p.status === 'completed' && (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 shrink-0">Đã hoàn thành</span>
                            )}
                          </div>
                          {(p.start_date || p.end_date) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {p.start_date ? new Date(p.start_date).toLocaleDateString('vi-VN') : ''}
                              {p.end_date ? ` – ${new Date(p.end_date).toLocaleDateString('vi-VN')}` : ''}
                            </p>
                          )}
                        </Link>
                      </td>
                      <td className="p-0 hidden md:table-cell">
                        <Link href={`/projects/${p.id}`} className="block px-5 py-4 text-gray-500">
                          {p.customer_name}{p.address ? ` · ${p.address}` : ''}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={`/projects/${p.id}`} className="block px-5 py-4 text-right font-medium text-indigo-700">
                          {fin ? formatVND(fin.totalRevenue) : '—'}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={`/projects/${p.id}`} className={`block px-5 py-4 text-right font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {fin ? formatVND(fin.totalProfit) : '—'}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={`/projects/${p.id}`} className={`block px-5 py-4 text-right font-bold text-base ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {fin ? `${fin.profitPct}%` : '—'}
                        </Link>
                      </td>
                      {isCeo && (
                        <td className="px-3 py-4">
                          <CommissionTickCell
                            projectId={p.id}
                            commissionHieu={p.commission_hieu ?? false}
                            commissionTan={p.commission_tan ?? false}
                          />
                        </td>
                      )}
                      <td className="p-0">
                        <Link href={`/projects/${p.id}`} className="flex items-center justify-center px-3 py-4">
                          <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Total row */}
              {(() => {
                const totalRev = [...finMap.values()].reduce((s, f) => s + f.totalRevenue, 0)
                const totalProfit = [...finMap.values()].reduce((s, f) => s + f.totalProfit, 0)
                const totalPct = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : '—'
                return (
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td className="px-5 py-3 font-semibold text-gray-700">Tổng cộng</td>
                      <td className="hidden md:table-cell"></td>
                      <td className="px-5 py-3 text-right font-semibold text-indigo-700">{formatVND(totalRev)}</td>
                      <td className={`px-5 py-3 text-right font-semibold ${totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatVND(totalProfit)}</td>
                      <td className={`px-5 py-3 text-right font-bold text-base ${totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{totalPct}%</td>
                      {isCeo && <td></td>}
                      <td></td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>
        </div>
      ) : (
        /* Simple list for other roles */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {projects.map((p: { id: string; name: string; customer_name: string; address?: string; status: string }) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 group-hover:text-blue-600 truncate">{p.name}</p>
                    {p.status === 'completed' && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 shrink-0">Đã hoàn thành</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {p.customer_name}{p.address ? ` · ${p.address}` : ''}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0 ml-4" />
              </Link>
            ))}
          </div>
        </div>
      )}
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
