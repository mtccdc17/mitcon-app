'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'

interface Props {
  label: string
  month: number            // 1-12 — tháng của bảng lương đang sửa
  year: number
  value: string            // đã lưu: "5/8, 6/8" (day/month)
  onChange: (dates: string, count: number) => void
  accent?: 'amber' | 'red'
}

const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// Tách chuỗi "5/8, 6/8/2026, 12/8" -> tập ngày thuộc đúng tháng đang xét
function parseDays(value: string, month: number): number[] {
  const out = new Set<number>()
  for (const tok of value.split(/[,;]+/)) {
    const m = tok.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})/)
    if (!m) continue
    const d = parseInt(m[1]); const mo = parseInt(m[2])
    if (mo === month && d >= 1 && d <= 31) out.add(d)
  }
  return [...out].sort((a, b) => a - b)
}

export default function LeaveDayPicker({ label, month, year, value, onChange, accent = 'amber' }: Props) {
  const [open, setOpen] = useState(false)
  const days = useMemo(() => parseDays(value, month), [value, month])
  const daySet = new Set(days)

  const daysInMonth = new Date(year, month, 0).getDate()
  // JS: 0=CN..6=T7 -> lệch để tuần bắt đầu từ T2
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7

  // Thứ 7 chỉ làm nửa buổi → nghỉ thứ 7 chỉ trừ 0.5 ngày công. Ngày khác = 1.
  const isSaturday = (d: number) => new Date(year, month - 1, d).getDay() === 6
  const dayWeight = (d: number) => (isSaturday(d) ? 0.5 : 1)
  const countDays = (arr: number[]) => arr.reduce((s, d) => s + dayWeight(d), 0)

  const on = accent === 'red'
  const chipCls = on
    ? 'bg-red-500 text-white border-red-500'
    : 'bg-amber-500 text-white border-amber-500'
  const ringCls = on ? 'focus:ring-red-400' : 'focus:ring-amber-400'

  function toggle(d: number) {
    const next = new Set(daySet)
    if (next.has(d)) next.delete(d); else next.add(d)
    const sorted = [...next].sort((a, b) => a - b)
    onChange(sorted.map(x => `${x}/${month}`).join(', '), countDays(sorted))
  }

  function clearAll() {
    onChange('', 0)
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-left hover:bg-gray-50 focus:outline-none focus:ring-2 ${ringCls}`}
      >
        <CalendarDays size={14} className="text-gray-400 shrink-0" />
        <span className={days.length ? 'text-gray-800' : 'text-gray-400'}>
          {days.length ? `${days.map(d => `${d}/${month}${isSaturday(d) ? ' (T7 ½)' : ''}`).join(', ')} · ${countDays(days)} ngày` : `Chọn ngày trong ${MONTHLABEL(month)}`}
        </span>
      </button>

      {open && (
        <div className="mt-1.5 p-2.5 border border-gray-200 rounded-lg bg-white shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-600">{MONTHLABEL(month)}/{year}</span>
            <div className="flex items-center gap-2">
              {days.length > 0 && (
                <button type="button" onClick={clearAll} className="text-[11px] text-gray-400 hover:text-red-500">Xóa hết</button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WD.map((w, i) => (
              <div key={w} className={`text-[10px] font-medium py-1 ${i === 6 ? 'text-red-400' : 'text-gray-400'}`}>{w}</div>
            ))}
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1
              const isSun = (firstDow + i) % 7 === 6
              const isSat = isSaturday(d)
              const sel = daySet.has(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(d)}
                  title={isSat ? 'Thứ 7 — chỉ tính 0.5 ngày công' : undefined}
                  className={`h-7 rounded text-xs tabular-nums border transition-colors relative ${
                    sel ? chipCls
                    : isSun ? 'border-transparent text-red-400 hover:bg-gray-100'
                    : isSat ? 'border-transparent text-amber-600 hover:bg-gray-100'
                    : 'border-transparent text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {d}{isSat && <sup className="text-[8px] ml-0.5">½</sup>}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">Bấm ngày để chọn/bỏ. <span className="text-amber-600">Thứ 7 (½)</span> chỉ tính 0.5 ngày công. Nửa ngày lẻ khác: sửa số ở ô bên trái.</p>
        </div>
      )}
    </div>
  )
}

function MONTHLABEL(m: number) {
  return `Tháng ${m}`
}
