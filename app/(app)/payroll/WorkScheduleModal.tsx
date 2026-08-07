'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, CalendarDays } from 'lucide-react'

interface Props {
  employee: { id: string; name: string; work_days?: number[] | null }
  onClose: () => void
}

const DAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
]

export default function WorkScheduleModal({ employee, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'auto' | 'custom'>(
    employee.work_days != null && employee.work_days.length > 0 ? 'custom' : 'auto'
  )
  const [days, setDays] = useState<Set<number>>(
    new Set(employee.work_days && employee.work_days.length > 0 ? employee.work_days : [1, 2, 3, 4, 5, 6])
  )

  function toggleDay(d: number) {
    setDays(prev => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d); else next.add(d)
      return next
    })
  }

  async function handleSave() {
    setLoading(true)
    const value = mode === 'auto' ? null : Array.from(days).sort()
    const { error } = await supabase.from('employees').update({ work_days: value }).eq('id', employee.id)
    setLoading(false)
    if (error) { alert(`Lỗi: ${error.message}`); return }
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-600" />
            <h2 className="font-semibold text-gray-900">Lịch làm việc — {employee.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="mode" checked={mode === 'auto'} onChange={() => setMode('auto')}
                className="accent-blue-600" />
              Tự động theo phòng ban (mặc định)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="mode" checked={mode === 'custom'} onChange={() => setMode('custom')}
                className="accent-blue-600" />
              Lịch riêng cho nhân sự này
            </label>
          </div>

          {mode === 'custom' && (
            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-800">Chọn ngày làm việc trong tuần</p>
              <div className="grid grid-cols-6 gap-1.5">
                {DAY_LABELS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      days.has(value)
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Chủ nhật luôn nghỉ, không tính. Mỗi ngày trong lịch riêng tính đủ 1 công (không chia nửa ngày thứ 7 như quy tắc mặc định).
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Hủy
            </button>
            <button type="button" onClick={handleSave} disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
