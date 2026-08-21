'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Pencil, UserPlus, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { Employee, PayrollEntry, PayrollResult, calcPayroll, isActiveInMonth } from './calc'
import { exportPayrollToXlsx, exportPayrollBhxhToXlsx } from './exportPayroll'
import EditPayrollModal from './EditPayrollModal'
import AddEmployeeModal from './AddEmployeeModal'
import { formatVND } from '@/lib/utils'

const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

const DEPT_COLOR: Record<string, string> = {
  'Thiết kế': 'bg-blue-100 text-blue-700',
  'Thi công':  'bg-orange-100 text-orange-700',
  'Marketing': 'bg-pink-100 text-pink-700',
  'Kế toán':   'bg-green-100 text-green-700',
  'Giám đốc':  'bg-purple-100 text-purple-700',
}

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

interface Props {
  employees: Employee[]
  entries: PayrollEntry[]
  month: number
  year: number
  userId: string
  advances?: PayrollAdvance[]
}

interface Row { emp: Employee; entry: PayrollEntry | undefined; result: PayrollResult }

export default function PayrollClient({ employees, entries, month, year, userId, advances = [] }: Props) {
  const router = useRouter()
  const [editTarget, setEditTarget] = useState<{ emp: Employee; entry: PayrollEntry | null } | null>(null)
  const [showAddEmp, setShowAddEmp] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const entryMap = useMemo(() => {
    const m = new Map<string, PayrollEntry>()
    entries.forEach(e => m.set(e.employee_id, e))
    return m
  }, [entries])

  // Tổng đã ứng lương của từng nhân sự trong tháng/năm đang xem.
  // ck = ứng từ TK Công ty → trừ Thực nhận (1); tm = Tiền mặt/TK Cá nhân → trừ Thực nhận (2)
  const advanceMap = useMemo(() => {
    const m = new Map<string, { ck: number; tm: number }>()
    advances
      .filter(a => a.advance_month === month && a.advance_year === year)
      .forEach(a => {
        const cur = m.get(a.staff_id) ?? { ck: 0, tm: 0 }
        if ((a.source_channel ?? 'tm') === 'tk_cty') cur.ck += a.advance_amount
        else cur.tm += a.advance_amount
        m.set(a.staff_id, cur)
      })
    return m
  }, [advances, month, year])

  const rows: Row[] = useMemo(() =>
    employees
      .filter(emp => isActiveInMonth(emp, month, year))
      .map(emp => ({
        emp,
        entry: entryMap.get(emp.id),
        result: calcPayroll(emp, entryMap.get(emp.id) ?? {}, month, year),
      })),
    [employees, entryMap, month, year]
  )

  const totals = useMemo(() => rows.reduce((acc, { emp, entry, result }) => {
    const isFullSalary = (emp.salary_type ?? 'proportional') === 'full'
    if (!entry && !isFullSalary) return acc   // Skip employees with no entry yet
    const adv = advanceMap.get(emp.id) ?? { ck: 0, tm: 0 }
    const daUng = adv.ck + adv.tm
    return {
      tnTruocThue:  acc.tnTruocThue  + result.tnTruocThue,
      bhxhNLD:      acc.bhxhNLD      + result.bhxhNLD,
      bhxhCTY:      acc.bhxhCTY      + result.bhxhCTY,
      thueNCN:      acc.thueNCN      + result.thueNCN,
      thucNhan1:    acc.thucNhan1    + result.thucNhan1,
      thucNhan2:    acc.thucNhan2    + result.thucNhan2,
      tongThucNhan: acc.tongThucNhan + result.tongThucNhan,
      daUng:        acc.daUng        + daUng,
      conPhaiTra:   acc.conPhaiTra   + (result.tongThucNhan - daUng),
      conTraCK:     acc.conTraCK     + (result.thucNhan1 - adv.ck),
      conTraTM:     acc.conTraTM     + (result.thucNhan2 - adv.tm),
    }
  }, { tnTruocThue: 0, bhxhNLD: 0, bhxhCTY: 0, thueNCN: 0, thucNhan1: 0, thucNhan2: 0, tongThucNhan: 0, daUng: 0, conPhaiTra: 0, conTraCK: 0, conTraTM: 0 }),
  [rows, advanceMap])

  function navigate(delta: number) {
    let m = month + delta, y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1)  { m = 12; y-- }
    router.push(`/payroll?month=${m}&year=${y}`)
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bảng tính lương</h1>
          <p className="text-sm text-gray-400">Mitcon Decor &amp; Design</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-green-200 rounded-xl hover:bg-green-50 text-green-700 font-medium"
            >
              <FileSpreadsheet size={14} /> Xuất Excel <ChevronDown size={13} />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => { exportPayrollToXlsx(rows, month, year, advanceMap); setShowExportMenu(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50"
                  >
                    <p className="font-medium text-gray-800">Xuất Full</p>
                    <p className="text-xs text-gray-400">Đầy đủ tất cả các khoản</p>
                  </button>
                  <button
                    onClick={() => { exportPayrollBhxhToXlsx(rows, month, year, advanceMap); setShowExportMenu(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-t border-gray-100"
                  >
                    <p className="font-medium text-gray-800">Xuất lương BHXH</p>
                    <p className="text-xs text-gray-400">Thực nhận 1 · TK Công ty &amp; BHXH</p>
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setShowAddEmp(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600"
          >
            <UserPlus size={14} /> Thêm nhân sự
          </button>
          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl px-1">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800 px-2 min-w-[110px] text-center">
              {MONTH_VN[month]} {year}
            </span>
            <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'TN trước thuế',  value: totals.tnTruocThue,  textCls: 'text-gray-800',   bg: 'bg-gray-50' },
          { label: 'Thực nhận (1)',   value: totals.thucNhan1,    textCls: 'text-green-700',  bg: 'bg-green-50' },
          { label: 'Thực nhận (2)',   value: totals.thucNhan2,    textCls: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Tổng thực nhận', value: totals.tongThucNhan, textCls: 'text-blue-700',   bg: 'bg-blue-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-2xl p-4`}>
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.textCls}`}>{formatVND(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {employees.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">Chưa có nhân sự nào.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-8">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Họ tên</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Phòng ban</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Loại HĐ</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">CC</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">NC</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-green-600">Thực nhận (1)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-orange-500">Thực nhận (2)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600">Tổng</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-amber-600">Đã ứng</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-purple-800">Còn phải trả</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(({ emp, entry, result }, idx) => {
                  const hasData = !!entry
                  const isFullSalary = (emp.salary_type ?? 'proportional') === 'full'
                  const adv = advanceMap.get(emp.id) ?? { ck: 0, tm: 0 }
                  const daUng = adv.ck + adv.tm
                  const conPhaiTra = result.tongThucNhan - daUng
                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-gray-50/40 transition-colors ${!hasData ? 'opacity-55' : ''}`}
                    >
                      <td className="px-4 py-3.5 text-xs text-gray-400">{idx + 1}</td>
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
                          result.isIntern
                            ? 'bg-purple-50 text-purple-700'
                            : result.isProbation
                              ? 'bg-orange-50 text-orange-600'
                              : 'bg-green-50 text-green-700'
                        }`}>
                          {result.isIntern ? 'Thực tập sinh' : result.isProbation ? 'Thử việc' : 'Chính thức'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-gray-500 tabular-nums">
                        {isFullSalary ? '—' : result.chuanCongAuto}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs tabular-nums">
                        {isFullSalary ? (
                          <span className="text-purple-500 font-medium text-[10px]">full</span>
                        ) : hasData ? (
                          <span className={entry!.actual_days < result.chuanCongAuto ? 'text-orange-600 font-medium' : 'text-gray-700'}>
                            {entry!.actual_days}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {hasData || isFullSalary ? (
                          adv.ck > 0 ? (
                            <div>
                              <span className={`font-semibold ${result.thucNhan1 - adv.ck < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                {formatVND(result.thucNhan1 - adv.ck)}
                              </span>
                              <p className="text-[10px] text-green-700">ứng TK CTY −{formatVND(adv.ck)}</p>
                            </div>
                          ) : (
                            <span className="text-green-700 font-semibold">{formatVND(result.thucNhan1)}</span>
                          )
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {adv.tm > 0 ? (
                          <div>
                            <span className={result.thucNhan2 - adv.tm < 0 ? 'text-red-600 font-semibold' : 'text-orange-600'}>
                              {formatVND(result.thucNhan2 - adv.tm)}
                            </span>
                            <p className="text-[10px] text-orange-600">ứng TM/CN −{formatVND(adv.tm)}</p>
                          </div>
                        ) : result.thucNhan2 > 0 ? (
                          <span className="text-orange-600">{formatVND(result.thucNhan2)}</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {hasData || isFullSalary ? (
                          <span className="text-blue-700 font-bold">{formatVND(result.tongThucNhan)}</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {daUng > 0 ? (
                          <span className="text-amber-600 font-medium">−{formatVND(daUng)}</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {(hasData || isFullSalary) ? (
                          <span className={`font-bold ${conPhaiTra < 0 ? 'text-red-600' : 'text-purple-800'}`}>
                            {formatVND(conPhaiTra)}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        {hasData || isFullSalary ? (
                          <button
                            onClick={() => setEditTarget({ emp, entry: entry ?? null })}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditTarget({ emp, entry: null })}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                          >
                            Nhập
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-100 bg-gray-50/80">
                  <td colSpan={6} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Tổng cộng
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-700 font-bold text-sm">
                    {formatVND(totals.thucNhan1)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-orange-600 font-bold text-sm">
                    {totals.thucNhan2 > 0 ? formatVND(totals.thucNhan2) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-700 font-bold text-sm">
                    {formatVND(totals.tongThucNhan)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-600 font-bold text-sm">
                    {totals.daUng > 0 ? `−${formatVND(totals.daUng)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-purple-800 font-bold text-sm">
                    {formatVND(totals.conPhaiTra)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Footer: BHXH/Tax summary */}
      {employees.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-4 flex flex-wrap gap-6">
          <div>
            <p className="text-[10px] text-gray-500 mb-0.5">BHXH NLĐ (10.5%)</p>
            <p className="text-sm text-gray-300 tabular-nums">{formatVND(totals.bhxhNLD)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-0.5">BHXH CTY (21.5%)</p>
            <p className="text-sm text-yellow-400 tabular-nums">{formatVND(totals.bhxhCTY)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-0.5">Thuế TNCN</p>
            <p className="text-sm text-gray-300 tabular-nums">{formatVND(totals.thueNCN)}</p>
          </div>
          {totals.daUng > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">Đã ứng trong tháng</p>
              <p className="text-sm text-amber-400 tabular-nums">−{formatVND(totals.daUng)}</p>
            </div>
          )}
          <div className="ml-auto">
            <p className="text-[10px] text-gray-500 mb-0.5">Tổng chi lương tháng</p>
            <p className="text-base text-blue-300 font-bold tabular-nums">{formatVND(totals.tongThucNhan)}</p>
          </div>
          {totals.daUng > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">Còn phải trả kỳ này</p>
              <p className="text-base text-purple-300 font-bold tabular-nums">{formatVND(totals.conPhaiTra)}</p>
              <p className="text-[10px] text-gray-500 tabular-nums">CK {formatVND(totals.conTraCK)} · TM {formatVND(totals.conTraTM)}</p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {editTarget && (
        <EditPayrollModal
          employee={editTarget.emp}
          entry={editTarget.entry}
          month={month}
          year={year}
          userId={userId}
          advance={advanceMap.get(editTarget.emp.id)}
          onClose={() => setEditTarget(null)}
        />
      )}
      {showAddEmp && (
        <AddEmployeeModal onClose={() => setShowAddEmp(false)} userId={userId} />
      )}
    </div>
  )
}
