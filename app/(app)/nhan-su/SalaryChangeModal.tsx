'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Trash2, TrendingUp } from 'lucide-react'
import { formatVND } from '@/lib/utils'
import { effectiveBaseSalary } from '@/app/(app)/payroll/calc'
import type { EmployeeRow } from './EmployeeModal'

interface Props {
  employee: EmployeeRow
  userId: string
  onClose: () => void
}

const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

export default function SalaryChangeModal({ employee, userId, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const now = new Date()
  const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2
  const nextYear  = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear()

  const currentSalary = effectiveBaseSalary(employee, now.getMonth() + 1, now.getFullYear())
  const history = [...(employee.salary_changes ?? [])].sort((a, b) =>
    (b.effective_year * 12 + b.effective_month) - (a.effective_year * 12 + a.effective_month))

  const [newSalary, setNewSalary] = useState('')
  const [fromMonth, setFromMonth] = useState(String(nextMonth))
  const [fromYear,  setFromYear]  = useState(String(nextYear))
  const [note, setNote] = useState('')

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-700 mb-1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseInt(newSalary)
    if (!amount || amount <= 0) return alert('Vui lòng nhập mức lương mới.')
    setLoading(true)
    const { error } = await supabase.from('salary_changes').insert({
      employee_id: employee.id,
      old_salary: currentSalary,
      new_salary: amount,
      effective_month: parseInt(fromMonth),
      effective_year: parseInt(fromYear),
      note: note.trim() || null,
      created_by: userId,
    })
    setLoading(false)
    if (error) { alert(`Lỗi: ${error.message}`); return }
    router.refresh()
    onClose()
  }

  async function handleDelete(id?: string) {
    if (!id) return
    if (!confirm('Xóa đợt tăng lương này?')) return
    const { error } = await supabase.from('salary_changes').delete().eq('id', id)
    if (error) { alert(`Lỗi: ${error.message}`); return }
    router.refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Xác nhận tăng lương — {employee.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
            Lương hiện tại: <strong className="text-gray-900">{formatVND(currentSalary)}</strong>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className={lbl}>Lương mới (đ) <span className="text-red-500">*</span></label>
              <input className={`${inp} text-right`} type="number" min="0" required
                value={newSalary} onChange={e => setNewSalary(e.target.value)} placeholder="9000000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Áp dụng từ — tháng</label>
                <input className={`${inp} text-right`} type="number" min="1" max="12"
                  value={fromMonth} onChange={e => setFromMonth(e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Áp dụng từ — năm</label>
                <input className={`${inp} text-right`} type="number" min="2020" max="2100"
                  value={fromYear} onChange={e => setFromYear(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={lbl}>Ghi chú</label>
              <input className={inp} value={note} onChange={e => setNote(e.target.value)}
                placeholder="VD: Tăng lương định kỳ" />
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Các tháng TRƯỚC mốc áp dụng vẫn tính theo lương cũ ({formatVND(currentSalary)}) — không ảnh hưởng bảng lương đã chốt.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Hủy
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-400">
                {loading ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </form>

          {history.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Lịch sử tăng lương</p>
              <div className="space-y-1.5">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between gap-2 text-xs group">
                    <span className="text-gray-600">
                      Từ {MONTH_VN[h.effective_month]}/{h.effective_year} → <strong className="text-gray-900">{formatVND(h.new_salary)}</strong>
                      {h.note && <span className="text-gray-400"> · {h.note}</span>}
                    </span>
                    <button onClick={() => handleDelete(h.id)}
                      className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
