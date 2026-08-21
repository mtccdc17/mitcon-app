'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatVND } from '@/lib/utils'
import { CheckCircle2, AlertCircle, Pencil, Trash2, X, History, Plus } from 'lucide-react'

interface SiteAdvance {
  id: string
  project_id: string
  project: string
  employee_id: string | null
  person: string
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
  const [editChannel, setEditChannel] = useState('tk_cty')
  const [editDate, setEditDate] = useState('')

  // Ghi tạm ứng mới
  const [showAddAdvance, setShowAddAdvance] = useState(false)
  const [addForm, setAddForm] = useState({
    employeeId: '', projectId: '', channel: 'tk_cn', amount: '',
    date: new Date().toISOString().split('T')[0], note: '',
  })

  // Sửa/xóa 1 khoản tạm ứng bất kỳ trong bảng lịch sử đầy đủ
  const [editingAdvance, setEditingAdvance] = useState<SiteAdvance | null>(null)
  const [advForm, setAdvForm] = useState({
    employeeId: '', projectId: '', channel: 'tk_cn', amount: '', returned: '',
    date: '', note: '',
  })

  // Nhóm theo employee
  const byEmployee = employees
    .map(emp => {
      const empAdvances = advances.filter(a => a.employee_id === emp.id)
      if (empAdvances.length === 0) return null

      // Nhóm theo project
      const byProject = empAdvances.reduce(
        (acc, adv) => {
          if (!acc[adv.project_id]) {
            acc[adv.project_id] = { name: adv.project, advances: [] }
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

  // Lịch sử toàn bộ tạm ứng công trình (mọi khoản, kể cả chưa gán giám sát) — theo bộ lọc trên
  const filteredAdvances = advances
    .filter(a => !filterEmployee || a.employee_id === filterEmployee)
    .filter(a => !filterProject || a.project_id === filterProject)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))

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
          project: summary.name,
          employee_id: settling.empId,
          person: settling.empName,
          channel: settleChannel,
          amount: companyOwes ? Math.abs(summary.remaining) : 0,
          returned: companyOwes ? 0 : summary.remaining,
          note: `${SETTLE_PREFIX}${settleNote ? ' | ' + settleNote : ''}`,
          date: settleDate,
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
        channel: editChannel,
        date: editDate,
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

  async function handleAddAdvance() {
    if (!addForm.employeeId || !addForm.projectId || !addForm.amount) {
      alert('Chọn giám sát, công trình và nhập số tiền.')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const emp = employees.find(e => e.id === addForm.employeeId)
    const proj = projects.find(p => p.id === addForm.projectId)
    const { error } = await supabase.from('site_advances').insert({
      project_id: addForm.projectId,
      project: proj?.name ?? '',
      employee_id: addForm.employeeId,
      person: emp?.name ?? '',
      channel: addForm.channel,
      amount: parseFloat(addForm.amount),
      returned: 0,
      date: addForm.date,
      note: addForm.note || null,
    })
    setSaving(false)
    if (!error) {
      setShowAddAdvance(false)
      setAddForm(f => ({ ...f, employeeId: '', projectId: '', amount: '', note: '' }))
      router.refresh()
    } else {
      alert('Lỗi ghi tạm ứng:\n' + error.message)
    }
  }

  async function handleUpdateAdvance() {
    if (!editingAdvance || !advForm.employeeId || !advForm.projectId) return
    setSaving(true)
    const supabase = createClient()
    const emp = employees.find(e => e.id === advForm.employeeId)
    const proj = projects.find(p => p.id === advForm.projectId)
    const { error } = await supabase
      .from('site_advances')
      .update({
        project_id: advForm.projectId,
        project: proj?.name ?? '',
        employee_id: advForm.employeeId,
        person: emp?.name ?? '',
        channel: advForm.channel,
        amount: parseFloat(advForm.amount) || 0,
        returned: parseFloat(advForm.returned) || 0,
        date: advForm.date,
        note: advForm.note || null,
      })
      .eq('id', editingAdvance.id)
    setSaving(false)
    if (!error) {
      setEditingAdvance(null)
      router.refresh()
    } else {
      alert('Lỗi cập nhật:\n' + error.message)
    }
  }

  async function handleDeleteAdvance(id: string) {
    if (!confirm('Xóa khoản tạm ứng này?')) return
    const supabase = createClient()
    const { error } = await supabase.from('site_advances').delete().eq('id', id)
    if (!error) router.refresh()
    else alert('Lỗi xóa:\n' + error.message)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Quyết toán tạm ứng công trình</h1>
            <p className="text-gray-600 mt-1">Chốt tiền tạm ứng và phân bổ vào dòng tiền công trình</p>
          </div>
          <button
            onClick={() => { setAddForm(f => ({ ...f, date: new Date().toISOString().split('T')[0] })); setShowAddAdvance(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition"
          >
            <Plus size={15} /> Ghi tạm ứng
          </button>
        </div>

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
                          <span className="flex-1 min-w-0 text-gray-600 truncate">{h.project} · {h.note}</span>
                          <span className="font-semibold text-gray-900 tabular-nums">
                            {h.amount > 0 ? `+${formatVND(h.amount)}` : `-${formatVND(h.returned)}`}
                          </span>
                          <button
                            onClick={() => { setEditingSettlement(h); setEditAmount(String(h.amount)); setEditReturned(String(h.returned)); setEditNote(h.note ?? ''); setEditChannel(h.channel || 'tk_cty'); setEditDate(h.date) }}
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

        {/* Lịch sử toàn bộ tạm ứng công trình */}
        <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-800">Lịch sử toàn bộ tạm ứng công trình</h3>
            <p className="text-xs text-gray-500 mt-0.5">Ứng = tiền RA khỏi kênh nguồn · {filteredAdvances.length} khoản</p>
          </div>
          {filteredAdvances.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center italic">Chưa có khoản tạm ứng nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 font-medium">Ngày</th>
                    <th className="text-left px-4 py-2.5 font-medium">Người ứng</th>
                    <th className="text-left px-4 py-2.5 font-medium">Công trình</th>
                    <th className="text-left px-4 py-2.5 font-medium">Kênh</th>
                    <th className="text-right px-4 py-2.5 font-medium">Đã ứng</th>
                    <th className="text-right px-4 py-2.5 font-medium">Trả lại</th>
                    <th className="text-right px-5 py-2.5 font-medium">Chưa hoàn</th>
                    <th className="px-3 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAdvances.map(r => {
                    const remaining = r.amount - (r.returned ?? 0)
                    const done = remaining <= 0
                    const isSettlement = r.note?.startsWith(SETTLE_PREFIX)
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50/50 group ${isSettlement ? 'bg-orange-50/30' : ''}`}>
                        <td className="px-5 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                          {new Date(r.date + 'T00:00:00').toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{r.person}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{r.project ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{CH_LABEL[r.channel] ?? r.channel}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap">{formatVND(r.amount)}</td>
                        <td className="px-4 py-3 text-right text-green-600 tabular-nums text-xs whitespace-nowrap">{formatVND(r.returned ?? 0)}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                          <span className={done ? 'text-green-600' : 'text-orange-600'}>{formatVND(remaining)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingAdvance(r)
                                setAdvForm({
                                  employeeId: r.employee_id ?? '',
                                  projectId: r.project_id,
                                  channel: r.channel,
                                  amount: String(r.amount),
                                  returned: String(r.returned ?? 0),
                                  date: r.date,
                                  note: r.note ?? '',
                                })
                              }}
                              className="p-1 text-gray-300 hover:text-blue-600 rounded"
                            >
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => handleDeleteAdvance(r.id)} className="p-1 text-gray-300 hover:text-red-500 rounded">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
              <p className="text-xs text-gray-500">{editingSettlement.project} · {editingSettlement.person}</p>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Ngày ghi nhận</label>
                <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kênh tiền</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={editChannel} onChange={e => setEditChannel(e.target.value)}>
                  {Object.entries(CH_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
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

      {/* Add Advance Modal */}
      {showAddAdvance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Ghi tạm ứng công trình</h3>
              <button onClick={() => setShowAddAdvance(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Người ứng</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={addForm.employeeId} onChange={e => setAddForm(f => ({ ...f, employeeId: e.target.value }))}>
                    <option value="">-- Chọn giám sát viên --</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Công trình</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={addForm.projectId} onChange={e => setAddForm(f => ({ ...f, projectId: e.target.value }))}>
                    <option value="">-- Chọn công trình --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Số tiền ứng (₫)</label>
                  <input type="number" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right"
                    placeholder="0" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ứng từ kênh</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={addForm.channel} onChange={e => setAddForm(f => ({ ...f, channel: e.target.value }))}>
                    {Object.entries(CH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ngày ứng</label>
                  <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú</label>
                  <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 flex gap-2 justify-end border-t">
              <button onClick={() => setShowAddAdvance(false)} disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50">Hủy</button>
              <button onClick={handleAddAdvance} disabled={saving}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded-lg font-medium">
                {saving ? '...' : 'Ghi tạm ứng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Advance Modal (bảng lịch sử đầy đủ) */}
      {editingAdvance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Sửa khoản tạm ứng</h3>
              <button onClick={() => setEditingAdvance(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Người ứng</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={advForm.employeeId} onChange={e => setAdvForm(f => ({ ...f, employeeId: e.target.value }))}>
                    <option value="">-- Chọn giám sát viên --</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Công trình</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={advForm.projectId} onChange={e => setAdvForm(f => ({ ...f, projectId: e.target.value }))}>
                    <option value="">-- Chọn công trình --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Đã ứng (₫)</label>
                  <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right"
                    value={advForm.amount} onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Trả lại (₫)</label>
                  <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right"
                    value={advForm.returned} onChange={e => setAdvForm(f => ({ ...f, returned: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ngày</label>
                  <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={advForm.date} onChange={e => setAdvForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kênh tiền</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={advForm.channel} onChange={e => setAdvForm(f => ({ ...f, channel: e.target.value }))}>
                    {Object.entries(CH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={advForm.note} onChange={e => setAdvForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 flex gap-2 justify-end border-t">
              <button onClick={() => setEditingAdvance(null)} disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50">Hủy</button>
              <button onClick={handleUpdateAdvance} disabled={saving}
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
