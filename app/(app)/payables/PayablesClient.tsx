'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatVND } from '@/lib/utils'
import { Filter, X, ChevronDown, ChevronRight } from 'lucide-react'

interface PaymentEntry {
  amount: number
  date: string
  method: string
}

interface Row {
  id: string
  description: string
  amount: number
  payment_status: string
  actual_paid: number | null
  transaction_date: string
  supplier: string
  is_labor: boolean
  tncn_amount: number | null
  vat_amount: number | null
  next_payment_date: string | null
  payment_history: PaymentEntry[] | null
  paid: number
  owed: number
  projects: { id: string; name: string } | null
  categories: { name: string } | null
}

const STATUS_LABEL: Record<string, string> = { paid: 'Đã TT', pending: 'Chưa TT', partial: 'TT một phần' }
const STATUS_COLOR: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-orange-100 text-orange-700',
  partial: 'bg-yellow-100 text-yellow-700',
}

const NOTE_COLOR: Record<string, string> = {
  'TM': 'bg-green-100 text-green-700',
  'CK CTY': 'bg-blue-100 text-blue-700',
  'CK CN': 'bg-violet-100 text-violet-700',
  // legacy values
  'Tiền mặt': 'bg-green-100 text-green-700',
  'CK công ty': 'bg-blue-100 text-blue-700',
  'CK cá nhân': 'bg-violet-100 text-violet-700',
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả', color: 'text-gray-600 border-gray-200 hover:bg-gray-50', active: 'bg-gray-800 text-white border-gray-800' },
  { value: 'pending', label: 'Chưa TT', color: 'text-orange-600 border-orange-200 hover:bg-orange-50', active: 'bg-orange-500 text-white border-orange-500' },
  { value: 'partial', label: 'TT một phần', color: 'text-yellow-600 border-yellow-200 hover:bg-yellow-50', active: 'bg-yellow-500 text-white border-yellow-500' },
  { value: 'paid', label: 'Đã TT', color: 'text-green-600 border-green-200 hover:bg-green-50', active: 'bg-green-600 text-white border-green-600' },
]

export default function PayablesClient({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [projectFilter, setProjectFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showProjectDrop, setShowProjectDrop] = useState(false)
  const [showSupplierDrop, setShowSupplierDrop] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Unique projects and suppliers from all rows
  const allProjects = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach(r => { if (r.projects) map.set(r.projects.id, r.projects.name) })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const allSuppliers = useMemo(() => {
    const filtered = projectFilter ? rows.filter(r => r.projects?.id === projectFilter) : rows
    return Array.from(new Set(filtered.map(r => r.supplier))).sort()
  }, [rows, projectFilter])

  // Apply filters
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (projectFilter && r.projects?.id !== projectFilter) return false
      if (supplierFilter && r.supplier !== supplierFilter) return false
      if (statusFilter && r.payment_status !== statusFilter) return false
      return true
    })
  }, [rows, projectFilter, supplierFilter, statusFilter])

  // Summary totals
  const grandTotal = filtered.reduce((s, r) => s + r.amount, 0)
  const grandPaid = filtered.reduce((s, r) => s + r.paid, 0)
  const grandOwed = filtered.reduce((s, r) => s + r.owed, 0)
  const grandTNCN = filtered.filter(r => r.is_labor).reduce((s, r) => s + (r.tncn_amount ?? 0), 0)
  const grandVAT = filtered.reduce((s, r) => s + (r.vat_amount ?? 0), 0)
  const hasLabor = filtered.some(r => r.is_labor)
  const hasVAT = grandVAT > 0

  // Group by supplier
  const supplierMap = useMemo(() => {
    const map = new Map<string, Row[]>()
    filtered.forEach(r => {
      if (!map.has(r.supplier)) map.set(r.supplier, [])
      map.get(r.supplier)!.push(r)
    })
    return map
  }, [filtered])

  const colSpanBase = 7 + (hasLabor ? 1 : 0) + (hasVAT ? 1 : 0)

  function toggleRow(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Công nợ nhà cung cấp</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tổng hợp số tiền đã chi và còn thiếu theo từng nhà cung cấp / thầu phụ</p>
        </div>
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Project filter */}
          <div className="relative">
            <button
              onClick={() => { setShowProjectDrop(v => !v); setShowSupplierDrop(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                projectFilter ? 'text-blue-700 border-blue-300 bg-blue-50' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Filter size={14} />
              {projectFilter ? allProjects.find(p => p.id === projectFilter)?.name ?? 'Công trình' : 'Công trình'}
              {projectFilter && (
                <span onClick={e => { e.stopPropagation(); setProjectFilter(''); setSupplierFilter('') }}
                  className="ml-1 text-blue-400 hover:text-blue-700"><X size={12} /></span>
              )}
            </button>
            {showProjectDrop && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProjectDrop(false)} />
                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[220px] max-h-64 overflow-y-auto">
                  {allProjects.map(p => (
                    <button key={p.id} onClick={() => { setProjectFilter(p.id); setSupplierFilter(''); setShowProjectDrop(false) }}
                      className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-blue-50 transition-colors ${projectFilter === p.id ? 'text-blue-700 font-medium bg-blue-50' : 'text-gray-700'}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Supplier filter */}
          <div className="relative">
            <button
              onClick={() => { setShowSupplierDrop(v => !v); setShowProjectDrop(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                supplierFilter ? 'text-violet-700 border-violet-300 bg-violet-50' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Filter size={14} />
              {supplierFilter || 'Nhà cung cấp / Thầu phụ'}
              {supplierFilter && (
                <span onClick={e => { e.stopPropagation(); setSupplierFilter('') }}
                  className="ml-1 text-violet-400 hover:text-violet-700"><X size={12} /></span>
              )}
            </button>
            {showSupplierDrop && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSupplierDrop(false)} />
                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[240px] max-h-64 overflow-y-auto">
                  {allSuppliers.map(s => (
                    <button key={s} onClick={() => { setSupplierFilter(s); setShowSupplierDrop(false) }}
                      className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-violet-50 transition-colors ${supplierFilter === s ? 'text-violet-700 font-medium bg-violet-50' : 'text-gray-700'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Status filter — pill buttons */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 bg-gray-50">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                  statusFilter === opt.value ? opt.active : opt.color
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {(projectFilter || supplierFilter || statusFilter) && (
            <button onClick={() => { setProjectFilter(''); setSupplierFilter(''); setStatusFilter('') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
              Xóa tất cả lọc
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className={`grid gap-4 grid-cols-2 ${(hasLabor && hasVAT) ? 'md:grid-cols-5' : (hasLabor || hasVAT) ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Tổng giá trị</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatVND(grandTotal)}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-700 font-medium">Đã thanh toán</p>
          <p className="text-xl font-bold text-green-800 mt-1">{formatVND(grandPaid)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
          <p className="text-xs text-orange-700 font-medium">Còn nợ</p>
          <p className="text-xl font-bold text-orange-800 mt-1">{formatVND(grandOwed)}</p>
        </div>
        {hasVAT && (
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
            <p className="text-xs text-purple-700 font-medium">Thuế VAT cần nộp</p>
            <p className="text-xl font-bold text-purple-800 mt-1">{formatVND(grandVAT)}</p>
          </div>
        )}
        {hasLabor && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
            <p className="text-xs text-rose-700 font-medium">TNCN phải nộp</p>
            <p className="text-xl font-bold text-rose-800 mt-1">{formatVND(grandTNCN)}</p>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">
          Không có khoản chi nào phù hợp.
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(supplierMap.entries()).map(([supplier, txs]) => {
            const subTotal = txs.reduce((s, r) => s + r.amount, 0)
            const subPaid = txs.reduce((s, r) => s + r.paid, 0)
            const subOwed = txs.reduce((s, r) => s + r.owed, 0)
            const subTNCN = txs.filter(r => r.is_labor).reduce((s, r) => s + (r.tncn_amount ?? 0), 0)
            const subVAT = txs.reduce((s, r) => s + (r.vat_amount ?? 0), 0)
            const groupHasLabor = txs.some(r => r.is_labor)

            return (
              <div key={supplier} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Supplier header */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-x-5 gap-y-1">
                  <span className="font-semibold text-gray-900">{supplier}</span>
                  <span className="text-xs text-gray-500">{txs.length} khoản</span>
                  <span className="text-xs text-gray-600">Tổng: <span className="font-medium text-gray-900">{formatVND(subTotal)}</span></span>
                  <span className="text-xs text-green-700">Đã TT: <span className="font-medium">{formatVND(subPaid)}</span></span>
                  {subOwed > 0
                    ? <span className="text-xs text-orange-600 font-medium">Còn nợ: <span className="font-semibold">{formatVND(subOwed)}</span></span>
                    : <span className="text-xs text-green-700 font-medium">✓ Thanh toán đủ</span>
                  }
                  {subVAT > 0 && (
                    <span className="text-xs text-purple-600 font-medium">VAT: <span className="font-semibold">{formatVND(subVAT)}</span></span>
                  )}
                  {groupHasLabor && subTNCN > 0 && (
                    <span className="text-xs text-rose-600 font-medium">TNCN: <span className="font-semibold">{formatVND(subTNCN)}</span></span>
                  )}
                </div>

                {/* Transactions */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Công trình</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Hạng mục</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Nội dung chi</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Số tiền</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-green-700 whitespace-nowrap">Đã chi</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-orange-600 whitespace-nowrap">Còn thiếu</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 whitespace-nowrap">Ngày TT tiếp</th>
                        {hasVAT && <th className="text-right px-4 py-2.5 text-xs font-medium text-purple-600 whitespace-nowrap">VAT</th>}
                        {hasLabor && <th className="text-right px-4 py-2.5 text-xs font-medium text-rose-600 whitespace-nowrap">TNCN</th>}
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {txs.map(tx => {
                        const project = tx.projects
                        const category = tx.categories
                        const hasHistory = (tx.payment_history?.length ?? 0) > 0
                        const isExpanded = expandedRows.has(tx.id)
                        return (
                          <>
                          <tr key={tx.id} className="hover:bg-blue-50/30 cursor-pointer" onClick={() => router.push(`/projects/${project?.id}?edit=${tx.id}`)}>
                            <td className="px-4 py-2.5">
                              <span className="text-blue-700 font-medium text-xs">{project?.name ?? '—'}</span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                              {category?.name ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-900 max-w-[220px]">
                              <div className="flex items-center gap-1.5">
                                {tx.is_labor && (
                                  <span className="inline-flex px-1.5 py-0.5 bg-pink-100 text-pink-700 text-xs rounded font-medium flex-shrink-0">NC</span>
                                )}
                                <p className="truncate">{tx.description}</p>
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(tx.transaction_date).toLocaleDateString('vi-VN')}
                              </p>
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-gray-900 whitespace-nowrap">
                              {formatVND(tx.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-green-700 whitespace-nowrap">
                              {tx.paid > 0 ? (
                                <div>
                                  <span>{formatVND(tx.paid)}</span>
                                  {hasHistory && (
                                    <button
                                      type="button"
                                      onClick={e => { e.preventDefault(); e.stopPropagation(); toggleRow(tx.id) }}
                                      className="relative z-10 ml-1.5 inline-flex items-center gap-0.5 text-xs text-orange-500 hover:text-orange-700"
                                    >
                                      {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                      {tx.payment_history!.length} đợt
                                    </button>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                              {tx.owed > 0
                                ? <span className="text-orange-600">{formatVND(tx.owed)}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {tx.next_payment_date
                                ? <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                    new Date(tx.next_payment_date) < new Date()
                                      ? 'bg-red-100 text-red-600'
                                      : 'bg-orange-50 text-orange-600'
                                  }`}>
                                    {new Date(tx.next_payment_date).toLocaleDateString('vi-VN')}
                                  </span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            {hasVAT && (
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                {(tx.vat_amount ?? 0) > 0
                                  ? <span className="text-purple-600 font-medium">{formatVND(tx.vat_amount!)}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                            )}
                            {hasLabor && (
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                {tx.is_labor && (tx.tncn_amount ?? 0) > 0
                                  ? <span className="text-rose-600 font-medium">{formatVND(tx.tncn_amount!)}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                            )}
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[tx.payment_status]}`}>
                                {STATUS_LABEL[tx.payment_status]}
                              </span>
                            </td>
                          </tr>
                          {/* Expandable payment history */}
                          {isExpanded && hasHistory && (
                            <tr key={`${tx.id}-history`} className="bg-orange-50/40">
                              <td colSpan={colSpanBase + 1} className="px-6 pb-3 pt-1">
                                <div className="border border-orange-100 rounded-lg overflow-hidden">
                                  <div className="bg-orange-50 px-3 py-1.5 border-b border-orange-100">
                                    <span className="text-xs font-semibold text-orange-700">Lịch sử thanh toán</span>
                                  </div>
                                  <div className="divide-y divide-orange-50">
                                    {tx.payment_history!.map((p, i) => (
                                      <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                                        <div className="flex items-center gap-2.5">
                                          <span className="text-orange-600 font-semibold">Đợt {i + 1}</span>
                                          <span className="text-gray-500">
                                            {p.date ? new Date(p.date + 'T00:00:00').toLocaleDateString('vi-VN') : '—'}
                                          </span>
                                          {p.method && (
                                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${NOTE_COLOR[p.method] ?? 'bg-gray-100 text-gray-600'}`}>
                                              {p.method}
                                            </span>
                                          )}
                                        </div>
                                        <span className="font-semibold text-gray-900">{formatVND(p.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </>
                        )
                      })}
                    </tbody>
                    {txs.length > 1 && (
                      <tfoot>
                        <tr className="border-t border-gray-200 bg-gray-50">
                          <td colSpan={3} className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Tổng cộng</td>
                          <td className="px-4 py-2 text-right font-bold text-gray-900 whitespace-nowrap text-sm">{formatVND(subTotal)}</td>
                          <td className="px-4 py-2 text-right font-bold text-green-700 whitespace-nowrap text-sm">{formatVND(subPaid)}</td>
                          <td className="px-4 py-2 text-right font-bold whitespace-nowrap text-sm">
                            {subOwed > 0
                              ? <span className="text-orange-600">{formatVND(subOwed)}</span>
                              : <span className="text-green-600">—</span>}
                          </td>
                          <td />
                          {hasVAT && (
                            <td className="px-4 py-2 text-right font-bold text-purple-600 whitespace-nowrap text-sm">
                              {subVAT > 0 ? formatVND(subVAT) : '—'}
                            </td>
                          )}
                          {hasLabor && (
                            <td className="px-4 py-2 text-right font-bold text-rose-600 whitespace-nowrap text-sm">
                              {subTNCN > 0 ? formatVND(subTNCN) : '—'}
                            </td>
                          )}
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
