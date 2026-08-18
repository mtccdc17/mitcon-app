'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatVND } from '@/lib/utils'
import { CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react'

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
  const [saving, setSaving] = useState(false)

  // Lọc tạm ứng theo filter
  const filteredAdvances = advances.filter(a => {
    if (filterEmployee && a.employee_id !== filterEmployee) return false
    if (filterProject && a.project_id !== filterProject) return false
    return true
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

      return {
        empId: emp.id,
        empName: emp.name,
        projSummary,
        totalRemaining,
      }
    })
    .filter(Boolean) as Array<{
      empId: string
      empName: string
      projSummary: Array<{ projId: string; name: string; totalAdvanced: number; spent: number; totalReturned: number; remaining: number }>
      totalRemaining: number
    }>

  async function handleSettle() {
    if (!settling) return
    setSaving(true)
    try {
      const supabase = createClient()

      // Tạo transaction cho từng CT
      const txPromises: any[] = []
      for (const projId of settling.projIds) {
        const empData = byEmployee.find(e => e.empId === settling.empId)
        if (!empData) continue

        const summary = empData.projSummary.find(p => p.projId === projId)
        if (!summary) continue

        const amount = Math.abs(summary.remaining)
        const description = `Chốt quỹ ứng ${settling.empName}`
        const memo = `${description} | ${summary.name}${settleNote ? ` | ${settleNote}` : ''}`

        txPromises.push(
          supabase.from('transactions').insert({
            project_id: projId,
            transaction_date: new Date().toISOString().split('T')[0],
            unit: 'CEO',
            description: memo,
            amount,
            advance_employee_id: settling.empId,
            created_by: userId,
          })
        )
      }

      const results = await Promise.all(txPromises)
      const errors = results.filter(r => r.error)

      if (errors.length > 0) {
        alert('Lỗi ghi transaction:\n' + errors.map(e => e.error?.message).join('\n'))
      } else {
        alert('✅ Chốt quỹ ứng thành công!')
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Quyết toán tạm ứng công trình</h1>
        <p className="text-gray-600 mb-6">Chốt tiền tạm ứng và phân bổ vào dòng tiền</p>

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
          {byEmployee.map(emp => (
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
                      {emp.totalRemaining < 0 ? 'CT thiếu công ty' : 'Công ty thiếu CT'}
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

              {/* Settle Button */}
              <div className="bg-gray-100 px-4 py-3 border-t flex justify-end">
                <button
                  onClick={() => setSettling({ empId: emp.empId, empName: emp.empName, projIds: emp.projSummary.map(p => p.projId) })}
                  disabled={emp.totalRemaining === 0}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white rounded-lg font-medium text-sm transition"
                >
                  Chốt quỹ ứng
                </button>
              </div>
            </div>
          ))}
        </div>

        {byEmployee.length === 0 && (
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
                <p className="text-sm text-gray-600">Sẽ tạo transaction chi và phân bổ vào dòng tiền.</p>
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
    </div>
  )
}
