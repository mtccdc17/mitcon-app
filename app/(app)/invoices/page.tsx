import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect } from 'next/navigation'
import { formatVND } from '@/lib/utils'

export default async function InvoicesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*, projects(name), categories(name)')
    .neq('invoice_status', 'no_invoice')
    .order('transaction_date', { ascending: false })

  const rows = transactions ?? []
  const totalWithInvoice = rows.filter(r => r.invoice_status === 'has_invoice').reduce((s, r) => s + r.amount, 0)
  const totalWaiting = rows.filter(r => r.invoice_status === 'waiting').reduce((s, r) => s + r.amount, 0)

  const STATUS_LABEL: Record<string, string> = {
    has_invoice: 'Đã có HĐ',
    waiting: 'Chờ xuất HĐ',
    no_invoice: 'Không có HĐ',
  }
  const STATUS_COLOR: Record<string, string> = {
    has_invoice: 'bg-green-100 text-green-700',
    waiting: 'bg-yellow-100 text-yellow-700',
    no_invoice: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Hóa đơn đầu vào</h1>
        <p className="text-sm text-gray-500 mt-0.5">Kiểm soát tình trạng hóa đơn VAT của các khoản chi</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-700 font-medium">Đã có hóa đơn</p>
          <p className="text-xl font-bold text-green-800 mt-1">{formatVND(totalWithInvoice)}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
          <p className="text-xs text-yellow-700 font-medium">Chờ xuất hóa đơn</p>
          <p className="text-xl font-bold text-yellow-800 mt-1">{formatVND(totalWaiting)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">Danh sách hóa đơn đầu vào</h2>
        </div>
        {rows.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Chưa có hóa đơn nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Ngày</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Công trình</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Hạng mục</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Nội dung</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Số tiền</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Trạng thái HĐ</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden lg:table-cell">Nhà cung cấp</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden lg:table-cell">Số HĐ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(r.transaction_date).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-5 py-3 text-gray-900">
                      {(r.projects as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden md:table-cell">
                      {(r.categories as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-900">{r.description}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {formatVND(r.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.invoice_status]}`}>
                        {STATUS_LABEL[r.invoice_status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden lg:table-cell">{r.supplier ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600 hidden lg:table-cell">{r.invoice_number ?? '—'}</td>
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
