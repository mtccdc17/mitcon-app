'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Percent } from 'lucide-react'
import { formatVND } from '@/lib/utils'
import { effectiveBaseSalary, type Employee } from './calc'

export interface CommissionRow {
  id: string
  project_id: string
  employee_id: string
  rate: number
  base_amount: number
  commission_amount: number
  pay_month: number
  pay_year: number
  applied: boolean
  applied_at?: string | null
  manual_override?: boolean
}

interface Props {
  commissions: CommissionRow[]
  employees: Employee[]
  projects: { id: string; name: string }[]
  userId: string
}

const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

export default function CommissionClient({ commissions, employees, projects, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [applying, setApplying] = useState<string | null>(null)
  const [deductions, setDeductions] = useState<Record<string, string>>({})
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [editMonth, setEditMonth] = useState('')
  const [editYear, setEditYear] = useState('')

  const empName = useMemo(() => new Map(employees.map(e => [e.id, e.name])), [employees])
  const projName = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects])

  const pending = commissions.filter(c => !c.applied)
  const applied = commissions.filter(c => c.applied)

  interface Group { key: string; employee_id: string; month: number; year: number; rows: CommissionRow[]; total: number }
  function groupBy(rows: CommissionRow[]): Group[] {
    const map = new Map<string, Group>()
    for (const r of rows) {
      const key = `${r.employee_id}_${r.pay_month}_${r.pay_year}`
      const g = map.get(key) ?? { key, employee_id: r.employee_id, month: r.pay_month, year: r.pay_year, rows: [], total: 0 }
      g.rows.push(r)
      g.total += r.commission_amount
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))
  }

  const pendingGroups = groupBy(pending)
  const appliedGroups = groupBy(applied)

  async function handleChangePeriod(rowId: string, month: number, year: number) {
    const { error } = await supabase.from('project_commissions')
      .update({ pay_month: month, pay_year: year, manual_override: true }).eq('id', rowId)
    if (error) { alert(`Lỗi: ${error.message}`); return }
    router.refresh()
  }

  async function handleApply(g: Group) {
    setApplying(g.key)
    const employee = employees.find(e => e.id === g.employee_id)
    if (!employee) { setApplying(null); return }

    const deduction = Math.max(0, parseInt(deductions[g.key] || '0', 10) || 0)
    const netTotal = g.total - deduction

    // Viết lại TOÀN BỘ ghi chú từ dữ liệu thật (không nối vào chữ cũ có thể đã lỗi thời/dài dòng) —
    // gồm mọi công trình ĐÃ áp dụng trước đó cho đúng kỳ này + công trình đang áp dụng lần này.
    const { data: allAppliedForPeriod } = await supabase
      .from('project_commissions')
      .select('id, project_id, commission_amount')
      .eq('employee_id', g.employee_id).eq('pay_month', g.month).eq('pay_year', g.year).eq('applied', true)

    const fullNote = [...(allAppliedForPeriod ?? []), ...g.rows]
      .map(r => `${projName.get(r.project_id) ?? '—'}: ${formatVND(r.commission_amount)}`)
      .concat(deduction > 0 ? [`Trừ tạm ứng: ${formatVND(deduction)}`] : [])
      .join('; ')

    const { data: existing } = await supabase
      .from('payroll_entries').select('id, hoa_hong')
      .eq('employee_id', g.employee_id).eq('month', g.month).eq('year', g.year).maybeSingle()

    let error
    if (existing) {
      ;({ error } = await supabase.from('payroll_entries')
        .update({ hoa_hong: (existing.hoa_hong ?? 0) + netTotal, hoa_hong_note: fullNote, updated_at: new Date().toISOString() })
        .eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('payroll_entries').insert({
        employee_id: g.employee_id, month: g.month, year: g.year,
        actual_days: 0, overtime_hours: 0, pc_grab: 0, kpi_bonus: 0, hoa_hong: netTotal, hoa_hong_note: fullNote,
        pc_dict: 0, pc_khac: 0, ngay_nghi_phep: 0, ngay_nghi_ghi_chu: '', note: '',
        employment_type_snap: employee.employment_type,
        salary_type_snap: employee.salary_type,
        base_salary_snap: effectiveBaseSalary(employee, g.month, g.year),
        bhxh_base_snap: employee.bhxh_base,
        created_by: userId,
        updated_at: new Date().toISOString(),
      }))
    }

    if (error) { alert(`Lỗi: ${error.message}`); setApplying(null); return }

    const { error: applyError } = await supabase.from('project_commissions')
      .update({ applied: true, applied_at: new Date().toISOString() })
      .in('id', g.rows.map(r => r.id))
    if (applyError) { alert(`Lỗi: ${applyError.message}`); setApplying(null); return }

    setApplying(null)
    router.refresh()
  }

  async function handleUndo(rowId: string) {
    if (!confirm('Hoàn tác dòng hoa hồng này? Lưu ý: KHÔNG tự trừ lại số đã cộng vào KPI/Thưởng — Sếp cần tự sửa tay số đó trong bảng lương nếu cần.')) return
    const { error } = await supabase.from('project_commissions')
      .update({ applied: false, applied_at: null }).eq('id', rowId)
    if (error) { alert(`Lỗi: ${error.message}`); return }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Percent size={18} className="text-amber-600" /> Hoa hồng công trình
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Tự tính từ đợt thu &quot;Quyết toán&quot; của công trình đã tick hoa hồng — trả vào kỳ lương 1 tháng sau ngày quyết toán.
        </p>
      </div>

      {pendingGroups.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Không có khoản hoa hồng nào đang chờ.</p>
      ) : (
        <div className="space-y-3">
          {pendingGroups.map(g => {
            const deduction = Math.max(0, parseInt(deductions[g.key] || '0', 10) || 0)
            const netTotal = g.total - deduction
            return (
              <div key={g.key} className="bg-amber-50/60 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-900">{empName.get(g.employee_id) ?? '—'}</p>
                    <p className="text-xs text-gray-500">Cộng vào kỳ lương {MONTH_VN[g.month]} {g.year}</p>
                  </div>
                  <button
                    onClick={() => handleApply(g)}
                    disabled={applying === g.key || netTotal < 0}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:bg-amber-300"
                  >
                    {applying === g.key ? 'Đang cộng...' : `Cộng ${formatVND(netTotal)} vào KPI CT`}
                  </button>
                </div>
                <div className="mt-2 space-y-1">
                  {g.rows.map(r => (
                    <div key={r.id} className="text-xs text-gray-600">
                      {editingRow === r.id ? (
                        <div className="flex items-center gap-1.5 py-0.5">
                          <span className="shrink-0">{projName.get(r.project_id) ?? '—'} · kỳ lương:</span>
                          <input type="number" min="1" max="12" value={editMonth}
                            onChange={e => setEditMonth(e.target.value)}
                            className="w-12 px-1 py-0.5 border border-gray-300 rounded text-xs text-right" />
                          <span>/</span>
                          <input type="number" min="2020" max="2100" value={editYear}
                            onChange={e => setEditYear(e.target.value)}
                            className="w-16 px-1 py-0.5 border border-gray-300 rounded text-xs text-right" />
                          <button
                            onClick={() => { handleChangePeriod(r.id, parseInt(editMonth) || r.pay_month, parseInt(editYear) || r.pay_year); setEditingRow(null) }}
                            className="text-blue-600 hover:underline font-medium">Lưu</button>
                          <button onClick={() => setEditingRow(null)} className="text-gray-400 hover:underline">Hủy</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span>
                            {projName.get(r.project_id) ?? '—'} · {(r.rate * 100).toFixed(1)}% × {formatVND(r.base_amount)}
                            {r.manual_override && <span className="ml-1 text-amber-600" title="Kỳ lương đã sửa tay">✎ đặc cách</span>}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium tabular-nums">{formatVND(r.commission_amount)}</span>
                            <button
                              onClick={() => { setEditingRow(r.id); setEditMonth(String(r.pay_month)); setEditYear(String(r.pay_year)) }}
                              className="text-gray-300 hover:text-blue-500" title="Sửa kỳ lương (đặc cách)">✎</button>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-amber-200/60 flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">Trừ tạm ứng đã chi trước (nếu có):</label>
                  <input
                    type="number" min="0"
                    value={deductions[g.key] ?? ''}
                    onChange={e => setDeductions(prev => ({ ...prev, [g.key]: e.target.value }))}
                    placeholder="0"
                    className="w-32 px-2 py-1 border border-gray-300 rounded-lg text-xs text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  {deduction > g.total && <span className="text-xs text-red-500">Vượt quá tổng hoa hồng</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {appliedGroups.length > 0 && (
        <details className="pt-2">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
            Lịch sử đã cộng ({appliedGroups.length} kỳ)
          </summary>
          <div className="mt-3 space-y-2">
            {appliedGroups.map(g => (
              <div key={g.key} className="border border-gray-100 rounded-lg p-3">
                <p className="text-sm text-gray-700">
                  <strong>{empName.get(g.employee_id) ?? '—'}</strong> · {MONTH_VN[g.month]} {g.year} · {formatVND(g.total)}
                </p>
                <div className="mt-1 space-y-1">
                  {g.rows.map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs text-gray-500">
                      <span>{projName.get(r.project_id) ?? '—'} · {formatVND(r.commission_amount)}</span>
                      <button onClick={() => handleUndo(r.id)} className="text-gray-300 hover:text-red-500">Hoàn tác</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
