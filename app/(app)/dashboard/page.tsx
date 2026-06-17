import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { formatVNDShort } from '@/lib/utils'
import { UserRole } from '@/lib/types'
import { Building2, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react'

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const role = profile.role as UserRole

  const supabase = await createClient()
  const [{ data: projectsRaw }, { data: txRaw }, { data: revRaw }] = await Promise.all([
    supabase.from('projects').select('id, name, customer_name, status').eq('status', 'active'),
    supabase.from('transactions').select('amount, vat_amount, tncn_amount, payment_status, project_id'),
    supabase.from('revenue').select('amount, status, project_id'),
  ])
  const projects = projectsRaw ?? []
  const transactions = txRaw ?? []
  const revenue = revRaw ?? []

  const totalRevenue = revenue.reduce((s, r) => s + (r.amount ?? 0), 0)
  const collectedRevenue = revenue.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
  const totalCost = transactions.reduce((s, t) => s + (t.amount ?? 0), 0)
  const totalVAT = transactions.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
  const totalTNCN = transactions.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)
  const unpaidCost = transactions.filter(t => t.payment_status === 'pending').reduce((s, t) => s + t.amount, 0)

  const isCeoOrKetoan = role === 'ceo' || role === 'ketoan'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Xin chào, {profile.full_name} — Tổng quan tình hình tài chính
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Công trình đang chạy"
          value={String(projects.length)}
          icon={<Building2 size={18} className="text-blue-600" />}
          bg="bg-blue-50"
        />

        {isCeoOrKetoan ? (
          <>
            <StatCard
              label="Tổng doanh thu HĐ"
              value={formatVNDShort(totalRevenue)}
              sub={`Đã thu: ${formatVNDShort(collectedRevenue)}`}
              icon={<TrendingUp size={18} className="text-green-600" />}
              bg="bg-green-50"
            />
            <StatCard
              label="Tổng chi phí CT"
              value={formatVNDShort(totalCost)}
              sub={`Chưa TT: ${formatVNDShort(unpaidCost)}`}
              icon={<AlertCircle size={18} className="text-orange-600" />}
              bg="bg-orange-50"
            />
            <StatCard
              label="VAT + TNCN phải nộp"
              value={formatVNDShort(totalVAT + totalTNCN)}
              sub={`VAT: ${formatVNDShort(totalVAT)} | TNCN: ${formatVNDShort(totalTNCN)}`}
              icon={<CheckCircle2 size={18} className="text-purple-600" />}
              bg="bg-purple-50"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Doanh thu"
              value="—"
              sub="Trạng thái xem ở tab Doanh thu"
              icon={<TrendingUp size={18} className="text-gray-400" />}
              bg="bg-gray-50"
            />
            <StatCard
              label="Chi phí công trình"
              value={formatVNDShort(totalCost)}
              sub={`Chưa TT: ${formatVNDShort(unpaidCost)}`}
              icon={<AlertCircle size={18} className="text-orange-600" />}
              bg="bg-orange-50"
            />
            <StatCard
              label="Thuế phải nộp"
              value={formatVNDShort(totalVAT + totalTNCN)}
              sub={`VAT: ${formatVNDShort(totalVAT)} | TNCN: ${formatVNDShort(totalTNCN)}`}
              icon={<CheckCircle2 size={18} className="text-purple-600" />}
              bg="bg-purple-50"
            />
          </>
        )}
      </div>

      {/* Projects table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">Công trình đang hoạt động</h2>
        </div>
        {projects.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            Chưa có công trình nào.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Tên công trình</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Khách hàng</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-5 py-3 text-gray-600 hidden md:table-cell">{p.customer_name}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Đang chạy
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  bg,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  bg: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>{icon}</div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
