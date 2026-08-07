'use client'

import { useState, useMemo } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { formatVND } from '@/lib/utils'
import type { Employee, PayrollEntry } from './calc'
import { isProbationMonth } from './calc'

interface PayrollAdvance {
  id: string
  staff_id: string
  advance_amount: number
  advance_month: number
  advance_year: number
  is_probation: boolean
  created_by: string
  created_at: string
  notes?: string
  source_channel?: string
}

const CHANNEL_LABEL: Record<string, string> = {
  tm: 'Tiền mặt',
  tk_cty: 'TK Công ty',
  tk_cn: 'TK Cá nhân',
}

interface Props {
  allEmployees: Employee[]
  entries: PayrollEntry[]
  month: number
  year: number
  userId: string
  advances: PayrollAdvance[]
}

const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

const DEPT_COLOR: Record<string, string> = {
  'Thiết kế': 'bg-blue-100 text-blue-700',
  'Thi công':  'bg-orange-100 text-orange-700',
  'Marketing': 'bg-pink-100 text-pink-700',
  'Kế toán':   'bg-green-100 text-green-700',
  'Giám đốc':  'bg-purple-100 text-purple-700',
}

export default function PayrollAdvancesClient({
  allEmployees,
  entries,
  month,
  year,
  userId,
  advances,
}: Props) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [advanceAmount, setAdvanceAmount] = useState<string>('')
  const [advanceMonth, setAdvanceMonth] = useState<number>(month)
  const [advanceYear, setAdvanceYear] = useState<number>(year)
  const [sourceChannel, setSourceChannel] = useState<string>('tm')
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState<string>('')
  const [editChannel, setEditChannel] = useState<string>('tm')
  const [editNotes, setEditNotes] = useState<string>('')

  const entryMap = useMemo(() => {
    const m = new Map<string, PayrollEntry>()
    entries.forEach(e => m.set(e.employee_id, e))
    return m
  }, [entries])

  const activeEmployees = useMemo(
    () => allEmployees.filter(emp => emp.is_active),
    [allEmployees]
  )

  const selectedEmployee = useMemo(
    () => activeEmployees.find(e => e.id === selectedStaffId),
    [selectedStaffId, activeEmployees]
  )

  const monthAdvances = useMemo(
    () => advances.filter(a => a.advance_month === month && a.advance_year === year),
    [advances, month, year]
  )

  const totalAdvanced = useMemo(
    () => monthAdvances.reduce((sum, a) => sum + a.advance_amount, 0),
    [monthAdvances]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStaffId || !advanceAmount) return

    setLoading(true)
    try {
      const res = await fetch('/api/payroll-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: selectedStaffId,
          advance_amount: parseFloat(advanceAmount),
          advance_month: advanceMonth,
          advance_year: advanceYear,
          is_probation: selectedEmployee
            ? isProbationMonth(selectedEmployee, selectedEmployee.employment_type, advanceMonth, advanceYear)
            : false,
          source_channel: sourceChannel,
          notes,
        }),
      })

      if (res.ok) {
        setSelectedStaffId('')
        setAdvanceAmount('')
        setNotes('')
        window.location.reload()
      } else {
        const err = await res.json().catch(() => null)
        alert('Lỗi khi lưu ứng lương:\n' + (err?.error ?? `HTTP ${res.status}`))
      }
    } finally {
      setLoading(false)
    }
  }

  function startEdit(advance: PayrollAdvance) {
    setEditingId(advance.id)
    setEditAmount(String(advance.advance_amount))
    setEditChannel(advance.source_channel ?? 'tm')
    setEditNotes(advance.notes ?? '')
  }

  async function handleSaveEdit(advanceId: string) {
    if (!editAmount) return
    setLoading(true)
    try {
      const res = await fetch(`/api/payroll-advances/${advanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advance_amount: parseFloat(editAmount),
          source_channel: editChannel,
          notes: editNotes,
        }),
      })
      if (res.ok) {
        setEditingId(null)
        window.location.reload()
      } else {
        const err = await res.json().catch(() => null)
        alert('Lỗi khi sửa ứng lương:\n' + (err?.error ?? `HTTP ${res.status}`))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(advanceId: string) {
    if (!confirm('Xóa ứng lương này?')) return

    setLoading(true)
    try {
      const res = await fetch(`/api/payroll-advances/${advanceId}`, { method: 'DELETE' })
      if (res.ok) {
        window.location.reload()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ứng lương nhân sự</h1>
        <p className="text-sm text-gray-400">Mitcon Decor &amp; Design</p>
      </div>

      {/* Form ứng lương */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Ứng lương mới</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chọn nhân sự */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nhân sự <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">-- Chọn nhân sự --</option>
              {activeEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.dept})
                </option>
              ))}
            </select>
          </div>

          {/* Số tiền ứng */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Số tiền ứng <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Tháng ứng */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Tháng ứng
            </label>
            <select
              value={advanceMonth}
              onChange={(e) => setAdvanceMonth(parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {MONTH_VN.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {/* Năm ứng */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Năm ứng
            </label>
            <input
              type="number"
              value={advanceYear}
              onChange={(e) => setAdvanceYear(parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Nguồn tiền */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nguồn tiền trích ứng
            </label>
            <select
              value={sourceChannel}
              onChange={(e) => setSourceChannel(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="tm">Tiền mặt</option>
              <option value="tk_cty">TK Công ty</option>
              <option value="tk_cn">TK Cá nhân</option>
            </select>
          </div>
        </div>

        {/* Ghi chú */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Ghi chú
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Lý do ứng lương, ghi chú khác..."
            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
          />
        </div>

        {/* Thông tin nhân sự đã chọn */}
        {selectedEmployee && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{selectedEmployee.name}</span>
              <span className="text-gray-500 mx-2">•</span>
              <span className="text-gray-600">{selectedEmployee.dept}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {selectedEmployee.title} {selectedEmployee.msnv}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedStaffId || !advanceAmount}
          className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={16} className="inline mr-1.5" />
          Lưu ứng lương
        </button>
      </form>

      {/* Bảng ứng lương tháng này */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            Ứng lương {MONTH_VN[month]} {year}
          </h2>
          <span className="text-sm text-gray-600">
            Tổng: <span className="font-bold text-blue-700">{formatVND(totalAdvanced)}</span>
          </span>
        </div>

        {monthAdvances.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            <p className="text-sm">Không có ứng lương nào trong tháng này.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nhân sự</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Phòng ban</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Loại</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Số tiền ứng</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Nguồn tiền</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Ghi chú</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthAdvances.map((advance) => {
                  const emp = allEmployees.find(e => e.id === advance.staff_id)
                  if (!emp) return null

                  return (
                    <tr key={advance.id} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-900 text-sm">{emp.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{emp.msnv} · {emp.title}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DEPT_COLOR[emp.dept ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                          {emp.dept}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          !advance.is_probation
                            ? 'bg-green-50 text-green-700'
                            : 'bg-orange-50 text-orange-600'
                        }`}>
                          {!advance.is_probation ? 'Chính thức' : 'Thử việc'}
                        </span>
                      </td>
                      {editingId === advance.id ? (
                        <>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              value={editAmount}
                              onChange={e => setEditAmount(e.target.value)}
                              className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={editChannel}
                              onChange={e => setEditChannel(e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="tm">Tiền mặt</option>
                              <option value="tk_cty">TK Công ty</option>
                              <option value="tk_cn">TK Cá nhân</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editNotes}
                              onChange={e => setEditNotes(e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleSaveEdit(advance.id)}
                                disabled={loading}
                                className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                                title="Lưu"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                disabled={loading}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                                title="Hủy"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            <span className="font-semibold text-blue-700">{formatVND(advance.advance_amount)}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs text-gray-600">{CHANNEL_LABEL[advance.source_channel ?? 'tm'] ?? advance.source_channel}</span>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-600">
                            {advance.notes && <span className="truncate">{advance.notes}</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEdit(advance)}
                                disabled={loading}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                                title="Sửa"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete(advance.id)}
                                disabled={loading}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                title="Xóa"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
