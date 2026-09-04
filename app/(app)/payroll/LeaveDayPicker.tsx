'use client'

import { useMemo, useState, useEffect } from 'react'
import { CalendarDays, X } from 'lucide-react'

interface Props {
  label: string
  month: number            // 1-12 — tháng của bảng lương đang sửa
  year: number
  value: string            // đã lưu: "5/8, 6/8*" (day/month, dấu * = nửa ngày)
  currentCount: number     // số ngày đang lưu (ô bên trái) — để đối chiếu, tự sửa nếu lệch
  onChange: (dates: string, count: number) => void
  accent?: 'amber' | 'red'
}

type DayState = 'full' | 'half'

const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// Tách chuỗi "5/8, 6/8/2026, 12/8*" -> Map ngày thuộc đúng tháng đang xét → 'full'/'half'
// (dấu * ở cuối = nửa ngày, người dùng tự đánh dấu qua bấm 2 lần trên lịch)
function parseDays(value: string, month: number): Map<number, DayState> {
  const out = new Map<number, DayState>()
  for (const tok of value.split(/[,;]+/)) {
    const t = tok.trim()
    const half = /\*\s*$/.test(t)
    const m = t.match(/^(\d{1,2})\s*\/\s*(\d{1,2})/)
    if (!m) continue
    const d = parseInt(m[1]); const mo = parseInt(m[2])
    if (mo === month && d >= 1 && d <= 31) out.set(d, half ? 'half' : 'full')
  }
  return out
}

export default function LeaveDayPicker({ label, month, year, value, currentCount, onChange, accent = 'amber' }: Props) {
  const [open, setOpen] = useState(false)
  const dayMap = useMemo(() => parseDays(value, month), [value, month])
  const days = useMemo(() => [...dayMap.keys()].sort((a, b) => a - b), [dayMap])

  const daysInMonth = new Date(year, month, 0).getDate()
  // JS: 0=CN..6=T7 -> lệch để tuần bắt đầu từ T2
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7

  // Thứ 7 chỉ làm nửa buổi → luôn tính 0.5, chỉ bật/tắt. Ngày khác: bấm 1 lần = cả ngày (1),
  // bấm 2 lần = nửa ngày (0.5) — dùng cho các buổi nghỉ đột xuất nửa ngày giữa tuần.
  const isSaturday = (d: number) => new Date(year, month - 1, d).getDay() === 6
  const dayWeight = (d: number, state: DayState) => (isSaturday(d) ? 0.5 : state === 'half' ? 0.5 : 1)
  const countMap = (m: Map<number, DayState>) => [...m.entries()].reduce((s, [d, st]) => s + dayWeight(d, st), 0)
  const stringifyMap = (m: Map<number, DayState>) =>
    [...m.entries()].sort((a, b) => a[0] - b[0])
      .map(([d, st]) => `${d}/${month}${!isSaturday(d) && st === 'half' ? '*' : ''}`)
      .join(', ')

  // Tự đối chiếu: dữ liệu cũ (lưu trước khi có luật "Thứ 7 = 0.5" / nửa ngày) có thể lệch với
  // ngày + trạng thái đã chọn trên lịch — mở lại là tự sửa cho khớp, khỏi cần bấm lại từng ngày.
  useEffect(() => {
    if (dayMap.size === 0) return
    const correct = countMap(dayMap)
    if (correct !== currentCount) onChange(value, correct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, month, year])

  const on = accent === 'red'
  const chipCls = on
    ? 'bg-red-500 text-white border-red-500'
    : 'bg-amber-500 text-white border-amber-500'
  const halfChipCls = on
    ? 'bg-red-100 text-red-700 border-red-300'
    : 'bg-amber-100 text-amber-700 border-amber-300'
  const ringCls = on ? 'focus:ring-red-400' : 'focus:ring-amber-400'

  function cycle(d: number) {
    const cur = dayMap.get(d)
    const next = new Map(dayMap)
    if (isSaturday(d)) {
      // Thứ 7 chỉ 2 trạng thái: chọn (luôn 0.5) / bỏ chọn
      if (cur) next.delete(d); else next.set(d, 'full')
    } else {
      // Ngày thường: bỏ chọn → cả ngày → nửa ngày → bỏ chọn
      if (!cur) next.set(d, 'full')
      else if (cur === 'full') next.set(d, 'half')
      else next.delete(d)
    }
    onChange(stringifyMap(next), countMap(next))
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
          {days.length
            ? `${days.map(d => `${d}/${month}${isSaturday(d) || dayMap.get(d) === 'half' ? ' (½)' : ''}`).join(', ')} · ${countMap(dayMap)} ngày`
            : `Chọn ngày trong ${MONTHLABEL(month)}`}
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
              const state = dayMap.get(d)
              const isHalf = isSat || state === 'half'
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => cycle(d)}
                  title={isSat ? 'Thứ 7 — chỉ tính 0.5 ngày công' : 'Bấm: cả ngày (1) → nửa ngày (0.5) → bỏ chọn'}
                  className={`h-7 rounded text-xs tabular-nums border transition-colors relative ${
                    state === 'full' ? chipCls
                    : state === 'half' ? halfChipCls
                    : isSun ? 'border-transparent text-red-400 hover:bg-gray-100'
                    : isSat ? 'border-transparent text-amber-600 hover:bg-gray-100'
                    : 'border-transparent text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {d}{isHalf && <sup className="text-[8px] ml-0.5">½</sup>}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Bấm 1 lần = cả ngày (1), bấm lần 2 = <span className="text-amber-600">nửa ngày (½)</span>, bấm lần 3 = bỏ chọn.
            Thứ 7 luôn tính 0.5, chỉ bật/tắt.
          </p>
        </div>
      )}
    </div>
  )
}

function MONTHLABEL(m: number) {
  return `Tháng ${m}`
}
