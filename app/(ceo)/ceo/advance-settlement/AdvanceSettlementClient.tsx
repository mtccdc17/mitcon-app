'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatVND } from '@/lib/utils'
import { CheckCircle2, AlertCircle, Pencil, Trash2, X, History } from 'lucide-react'

interface SiteAdvance {
  id: string
  project_id: string
  project_name: string
  employee_id: string | null
  person_name: string
  channel: string
  amount: number
  returned: number
  date: string
  note?: string
}

interface Project {
  id: string
  name: string
  status: string
}

interface Employee {
  id: string
  name: string
}

const CH_LABEL: Record<string, string> = {
  tk_cty: 'TK Công ty',
  tk_cn: 'TK Cá nhân',
  tm: 'Tiền mặt',
}

const SETTLE_PREFIX = 'Chốt quỹ ứng'

export default function AdvanceSettlementClient({
  userId,
  advances,
  projects,
  employees,
  spentByEmployeeProject,
}: {
  userId: string
  advances: SiteAdvance[]
  projects: Project[]
  employees: Employee[]
  spentByEmployeeProject: Record<string, Record<string, number>>
}) {
  const router = useRouter()
  const [filterEmployee, setFilterEmployee] = useState<string>('')
  const [filterProject, setFilterProject] = useState<string>('')
  const [settling, setSettling] = useState<{ empId: string; empName: string; projIds: string[] } | null>(null)
  const [settleNote, setSettleNote] = useState('')
  const [settleChannel, setSettleChannel] = useState('tk_cty')
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null)
  const [editingSettlement, setEditingSettlement] = useState<SiteAdvance | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editReturned, setEditReturned] = useState('')
  const [editNote, setEditNote] = useState('')

  // Nhóm theo employee
  const byEmployee = employees
    .map(emp => {
      const empAdvances = advances.filter(a => a.employee_id === emp.id)
      if (empAdvances.length === 0) return null

      // Nhóm theo project
      const byProject = empAdvances.reduce(
        (acc, adv) => {
          if (!acc[adv.project_id]) {
            acc[adv.project_id] = { name: adv.project_name, advances: [] }
          }
          acc[adv.project_id].advances.push(adv)
          return acc
        },
        {} as Record<string, { name: string; advances: SiteAdvance[] }>
      )

      // Tính tổng cho từng project
      const projSummary = Object.entries(byProject).map(([projId, { name, advances: projAdvances }]) => {
        const totalAdvanced = projAdvances.reduce((s, a) => s + a.amount, 0)
        const totalReturned = projAdvances.reduce((s, a) => s + a.returned, 0)
        const spent = spentByEmployeeProject[emp.id]?.[projId] ?? 0
        const remaining = totalAdvanced - spent - totalReturned
        return { projId, name, totalAdvanced, spent, totalReturned, remaining }
      })

      // Tổng toàn bộ CT
      const totalRemaining = projSummary.reduce((s, p) => s + p.remaining, 0)

      // Lịch sử các lần đã chốt quỹ trước đây (để sửa/xóa)
      const settlementHistory = empAdvances
        .filter(a => a.note?.startsWith(SETTLE_PREFIX))
        .sort((a, b) => (a.date < b.date ? 1 : -1))

      return {
        empId: emp.id,
        empName: emp.name,
        projSummary,
        totalRemaining,
        settlementHistory,
      }
    })
    .filter(Boolean) as Array<{
      empId: string
      empName: string
      projSummary: Array<{ projId: string; name: string; totalAdvanced: number; spent: number; totalReturned: number; remaining: number }>
      totalRemaining: number
      settlementHistory: SiteAdvance[]
    }>

  const filteredByEmployee = byEmployee
    .filter(emp => !filterEmployee || emp.empId === filterEmployee)
    .map(emp => ({
      ...emp,
      projSummary: emp.projSummary.filter(p => !filterProject || p.projId === filterProject),
    }))
    .filter(emp => emp.projSummary.length > 0)

  async function handleSettle() {
    if (!settling) return
    setSaving(true)
    try {
      const supabase = createClient()
      const empData = byEmployee.find(e => e.empId === settling.empId)
      if (!empData) { setSaving(false); return }

      // Ghi trực tiếp vào site_advances (không phải transactions) để không bị
      // tính nhầm là "đã chi thêm" ở vòng lặp kế tiếp — số dư sẽ về đúng 0.
      const rows: any[] = []
      for (const projId of settling.projIds) {
        const summary = empData.projSummary.find(p => p.projId === projId)
        if (!summary || summary.remaining === 0) continue

        const companyOwes = summary.remaining < 0 // spent > advanced → công ty nợ giám sát
        rows.push({
          project_id: projId,
          project_name: summary.name,
          employee_id: settling.empId,
          person_name: settling.empName,
          channel: settleChannel,
          amount: companyOwes ? Math.abs(summary.remaining) : 0,
          returned: companyOwes ? 0 : summary.remaining,
          note: `${SETTLE_PREFIX}${settleNote ? ' | ' + settleNote : ''}`,
          date: settleDate,
          created_by: userId,
        })
      }

      if (rows.length === 0) {
        setSaving(false)
        setSettling(null)
        return
      }

      const { error } = await supabase.from('site_advances').insert(rows)

      if (error) {
        alert('Lỗi ghi chốt quỹ ứng:\n' + error.message)
      } else {
        alert('✅ Chốt quỹ ứng thành công! Số dư đã về 0.')
        setSettling(null)
        setSettleNote('')
        router.refresh()
      }
    } catch (err) {
      alert('Lỗi: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateSettlement() {
    if (!editingSettlement) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('site_advances')
      .update({
        amount: parseFloat(editAmount) || 0,
        returned: parseFloat(editReturned) || 0,
        note: editNote || SETTLE_PREFIX,
      })
      .eq('id', editingSettlement.id)
    setSaving(false)
    if (!error) {
      setEditingSettlement(null)
      router.refresh()
    } else {
      alert('Lỗi cập nhật:\n' + error.message)
    }
  }

  async function handleDeleteSettlement(id: string) {
    if (!confirm('Xóa bản ghi chốt quỹ ứng này? Số dư sẽ quay lại như trước khi chốt.')) return
    const supabase = createClient()
    const { error } = await supabase.from('site_advances').delete().eq('id', id)
    if (!error) router.refresh()
    else alert('Lỗi xóa:\n' + error.message)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Quyết toán tạm ứng công trình</h1>
        <p className="text-gray-600 mb-6">Chốt tiền tạm ứng và phân bổ vào dòng tiền công trình</p>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6 flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Giám sát</label>
            <select
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Tất cả</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Công trình</label>
            <select
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Tất cả</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary by Employee */}
        <div className="space-y-4">
          {filteredByEmployee.map(emp => (
            <div key={emp.empId} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 border-l-4 border-blue-500">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{emp.empName}</h3>
                    <p className="text-sm text-gray-600">{emp.projSummary.length} công trình</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatVND(emp.totalRemaining)}
                    </div>
                    <p className={`text-xs font-medium ${emp.totalRemaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {emp.totalRemaining < 0 ? 'Công ty thiếu GS (chi vượt ứng)' : 'GS thiếu công ty (chưa hoàn hết)'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Project Breakdown */}
              <div className="p-4 space-y-3">
                {emp.projSummary.map(proj => (
                  <div key={proj.projId} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{proj.name}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-lg ${proj.remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatVND(proj.remaining)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <div>Ứng: <span className="font-medium text-gray-900">{formatVND(proj.totalAdvanced)}</span></div>
                      <div>Chi: <span className="font-medium text-gray-900">{formatVND(proj.spent)}</span></div>
                      <div>Hoàn: <span className="font-medium text-gray-900">{formatVND(proj.totalReturned)}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Lịch sử chốt quỹ */}
              {emp.settlementHistory.length > 0 && (
                <div className="border-t border-gray-100">
                  <button
                    onClick={() => setHistoryOpenFor(historyOpenFor === emp.empId ? null : emp.empId)}
                    className="w-full px-4 py-2.5 flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    <History size={13} />
                    Lịch sử chốt quỹ ({emp.settlementHistory.length})
                  </button>
                  {historyOpenFor === emp.empId && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {emp.settlementHistory.map(h => (
                        <div key={h.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                          <span className="text-gray-400 w-20 shrink-0">
                            {new Date(h.date + 'T00:00:00').toLocaleDateString('vi-VN')}
                          </span>
                          <span className="flex-1 min-w-0 text-gray-600 truncate">{h.project_name} · {h.note}</span>
                          <span className="font-semibold text-gray-900 tabular-nums">
                            {h.amount > 0 ? `+${formatVND(h.amount)}` : `-${formatVND(h.returned)}`}
                          </span>
                          <button
                            onClick={() => { setEditingSettlement(h); setEditAmount(String(h.amount)); setEditReturned(String(h.returned)); setEditNote(h.note ?? '') }}
                            className="p-1 text-gray-300 hover:text-blue-600 rounded"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteSettlement(h.id)}
                            className="p-1 text-gray-300 hover:text-red-500 rounded"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Settle Button */}
              <div className="bg-gray-100 px-4 py-3 border-t flex justify-end">
                <button
                  onClick={() => { setSettleDate(new Date().toISOString().split('T')[0]); setSettling({ empId: emp.empId, empName: emp.empName, projIds: emp.projSummary.map(p => p.projId) }) }}
                  disabled={emp.totalRemaining === 0}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white rounded-lg font-medium text-sm transition"
                >
                  Chốt quỹ ứng
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredByEmployee.length === 0 && (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>Không có dữ liệu tạm ứng</p>
          </div>
        )}
      </div>

      {/* Settle Modal */}
      {settling && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-4 border-b-2 border-orange-500">
              <h3 className="text-lg font-bold text-gray-900">Xác nhận chốt quỹ ứng</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm text-gray-600">Giám sát:</p>
                <p className="text-lg font-semibold text-gray-900">{settling.empName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Công trình:</p>
                <p className="text-sm font-medium text-gray-900">
                  {settling.projIds.map(id => projects.find(p => p.id === id)?.name).join(' + ')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Ngày chốt (ghi vào lịch sử dòng tiền):</p>
                <input
                  type="date"
                  value={settleDate}
                  onChange={e => setSettleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Kênh tiền (khi công ty phải trả GS):</p>
                <select
                  value={settleChannel}
                  onChange={e => setSettleChannel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {Object.entries(CH_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Ghi chú (tuỳ chọn):</p>
                <textarea
                  value={settleNote}
                  onChange={e => setSettleNote(e.target.value)}
                  placeholder="VD: Quyết toán tháng 8/2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  rows={2}
                />
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm text-gray-600">Số dư từng công trình sẽ về 0, ghi vào lịch sử tạm ứng công trình.</p>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 flex gap-2 justify-end border-t">
              <button
                onClick={() => setSettling(null)}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleSettle}
                disabled={saving}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded-lg font-medium flex items-center gap-2 transition"
              >
                {saving ? '...' : <>
                  <CheckCircle2 className="w-4 h-4" />
                  Chốt ngay
                </>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Settlement Modal */}
      {editingSettlement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Sửa bản ghi chốt quỹ</h3>
              <button onClick={() => setEditingSettlement(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500">{editingSettlement.project_name} · {editingSettlement.person_name}</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Số tiền công ty trả GS (amount)</label>
                <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right"
                  value={editAmount} onChange={e => setEditAmount(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Số tiền GS trả công ty (returned)</label>
                <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right"
                  value={editReturned} onChange={e => setEditReturned(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={editNote} onChange={e => setEditNote(e.target.value)} />
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 flex gap-2 justify-end border-t">
              <button onClick={() => setEditingSettlement(null)} disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50">Hủy</button>
              <button onClick={handleUpdateSettlement} disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium">
                {saving ? '...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
