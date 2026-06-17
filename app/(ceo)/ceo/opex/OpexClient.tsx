'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OperatingCost, Project, Contract, Category, Transaction, Revenue } from '@/lib/types'
import { formatVND, formatVNDShort } from '@/lib/utils'
import { Plus, X, ChevronDown, Download } from 'lucide-react'
import { exportFullSystemToExcel } from '@/lib/excel'

const MONTHS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12']
const COST_TYPES = [
  { value: 'salary', label: 'Lương nhân viên (có TNCN)' },
  { value: 'bhxh', label: 'BHXH' },
  { value: 'bonus', label: 'Thưởng ngoài (không khấu trừ)' },
  { value: 'office', label: 'Thuê văn phòng' },
  { value: 'equipment', label: 'Thiết bị / Máy tính (có VAT)' },
  { value: 'other', label: 'Chi phí khác' },
]

interface Props {
  costs: OperatingCost[]
  userId: string
  year: number
  tndn: number
  netProfit: number
  netVatRevenue: number
  totalProjectCost: number
  deductibleOpex: number
  backupData: {
    projects: Project[]
    contracts: Contract[]
    categories: Category[]
    transactions: Transaction[]
    revenue: Revenue[]
    operatingCosts: OperatingCost[]
  }
}

export default function OpexClient({ costs, userId, year, tndn, netProfit, netVatRevenue, totalProjectCost, deductibleOpex, backupData }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [showModal, setShowModal] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [loading, setLoading] = useState(false)

  const monthCosts = costs.filter(c => c.month === selectedMonth)
  const monthTotal = monthCosts.reduce((s, c) => s + c.amount, 0)
  const monthDeductible = monthCosts.filter(c => c.is_deductible).reduce((s, c) => s + c.amount, 0)

  // Quarterly grouping
  const quarters: { label: string; months: number[]; total: number; deductible: number }[] = [
    { label: 'Q1', months: [1, 2, 3], total: 0, deductible: 0 },
    { label: 'Q2', months: [4, 5, 6], total: 0, deductible: 0 },
    { label: 'Q3', months: [7, 8, 9], total: 0, deductible: 0 },
    { label: 'Q4', months: [10, 11, 12], total: 0, deductible: 0 },
  ]
  costs.forEach(c => {
    const q = quarters.find(q => q.months.includes(c.month))
    if (q) {
      q.total += c.amount
      if (c.is_deductible) q.deductible += c.amount
    }
  })
  const yearTotal = costs.reduce((s, c) => s + c.amount, 0)

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const isDeductible = form.get('tax_type') !== 'non_deductible'

    await supabase.from('operating_costs').insert({
      month: selectedMonth,
      year,
      description: form.get('description') as string,
      amount: parseInt(form.get('amount') as string || '0', 10),
      cost_type: form.get('cost_type') as string,
      vat_rate: form.get('vat_rate') as string || 'no_vat',
      tax_type: form.get('tax_type') as string || 'non_deductible',
      is_deductible: isDeductible,
      note: form.get('note') as string || null,
      created_by: userId,
    })

    setLoading(false)
    setShowModal(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Chi phí vận hành {year}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tuyệt mật — chỉ CEO xem được</p>
        </div>
        <button
          onClick={() => exportFullSystemToExcel(backupData)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900"
        >
          <Download size={14} />
          Xuất backup toàn hệ thống
        </button>
      </div>

      {/* TNDN Summary */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-amber-900 text-sm">Ước tính Thuế TNDN phải nộp</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <TaxRow label="Doanh thu HĐ VAT (sau VAT)" value={formatVND(netVatRevenue)} />
          <TaxRow label="Chi phí công trình" value={`-${formatVND(totalProjectCost)}`} color="text-red-600" />
          <TaxRow label="Chi phí vận hành khấu trừ" value={`-${formatVND(deductibleOpex)}`} color="text-orange-600" />
          <TaxRow label="Lợi nhuận ròng" value={formatVND(netProfit)} color={netProfit >= 0 ? 'text-green-700' : 'text-red-700'} />
        </div>
        <div className="bg-amber-100 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-amber-900">TNDN = 17% × Lợi nhuận ròng</span>
          <span className="text-xl font-bold text-amber-900">{formatVNDShort(tndn)}</span>
        </div>
      </div>

      {/* Quarterly summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {quarters.map(q => (
          <div key={q.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500">{q.label} — {year}</p>
            <p className="text-base font-semibold text-gray-900 mt-1">{formatVNDShort(q.total)}</p>
            <p className="text-xs text-green-600 mt-0.5">Khấu trừ: {formatVNDShort(q.deductible)}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Tổng chi phí vận hành {year}</p>
          <p className="text-xl font-bold text-gray-900">{formatVND(yearTotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Tổng được khấu trừ</p>
          <p className="text-lg font-semibold text-green-700">{formatVND(deductibleOpex)}</p>
        </div>
      </div>

      {/* Month selector + table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(i + 1)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedMonth === i + 1
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex-shrink-0 ml-3"
          >
            <Plus size={14} /> Thêm
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">Tháng {selectedMonth}/{year}</span>
            <span className="text-gray-500">Tổng: <span className="font-semibold text-gray-900">{formatVND(monthTotal)}</span> · Khấu trừ: <span className="font-semibold text-green-700">{formatVND(monthDeductible)}</span></span>
          </div>
          {monthCosts.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">Chưa có khoản nào trong tháng {selectedMonth}.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Nội dung</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Loại</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Số tiền</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Khấu trừ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthCosts.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-900">{c.description}</td>
                    <td className="px-5 py-3 text-gray-500 hidden md:table-cell">
                      {COST_TYPES.find(t => t.value === c.cost_type)?.label ?? c.cost_type}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{formatVND(c.amount)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.is_deductible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.is_deductible ? 'Được khấu trừ' : 'Không khấu trừ'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Thêm chi phí vận hành — T{selectedMonth}/{year}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Loại chi phí</label>
                <select name="cost_type" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Mô tả <span className="text-red-500">*</span></label>
                <input name="description" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND) <span className="text-red-500">*</span></label>
                  <input name="amount" type="number" required min="0" step="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Loại VAT</label>
                  <select name="vat_rate" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="no_vat">Không VAT</option>
                    <option value="vat_10">VAT 10%</option>
                    <option value="vat_8">VAT 8%</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tính khấu trừ thuế TNDN</label>
                <select name="tax_type" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="non_deductible">Không khấu trừ</option>
                  <option value="deductible_vat">Có VAT — được khấu trừ</option>
                  <option value="deductible_no_vat">Không VAT — được khấu trừ</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
                <input name="note" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
                  {loading ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function TaxRow({ label, value, color = 'text-gray-900' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white/60 rounded-lg p-3">
      <p className="text-xs text-amber-700 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  )
}
