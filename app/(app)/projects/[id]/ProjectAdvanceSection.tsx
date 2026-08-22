'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatVND, formatVNDShort } from '@/lib/utils'
import { X, Trash2, Plus, Pencil, FileText } from 'lucide-react'

export interface ProjectAdvance {
  id: string
  person: string
  employee_id?: string | null
  channel: string
  date: string
  amount: number
  returned: number
  note?: string | null
}

export interface Supervisor { id: string; name: string }

export interface AdvanceSpentItem {
  id: string
  date: string
  description: string
  category_name: string | null
  supplier: string | null
  is_labor: boolean
  advance_employee_id?: string | null
  amount: number
}

const CH_LABEL: Record<string, string> = { tk_cty: 'TK Công ty', tk_cn: 'TK Cá nhân', tm: 'Tiền mặt', ocb: 'OCB', lp: 'LPBank', mb: 'MB' }
const INP = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none'
const LBL = 'block text-xs font-medium text-gray-600 mb-1'

export default function ProjectAdvanceSection({
  projectId, projectName, advances, spent, spentItems, supervisors = [],
}: { projectId: string; projectName: string; advances: ProjectAdvance[]; spent: number; spentItems?: AdvanceSpentItem[]; supervisors?: Supervisor[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(advances)
  const [showAdd, setShowAdd] = useState(false)
  const [showSpentDetail, setShowSpentDetail] = useState(false)
  const [spentFilterId, setSpentFilterId] = useState('')
  const [returning, setReturning] = useState<ProjectAdvance | null>(null)
  const [returnAmount, setReturnAmount] = useState('')
  const [editing, setEditing] = useState<ProjectAdvance | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employeeId: '', channel: 'tk_cn', amount: '',
    date: new Date().toISOString().split('T')[0], note: '',
  })

  const totalAdvanced = rows.reduce((s, r) => s + r.amount, 0)
  const totalReturned = rows.reduce((s, r) => s + (r.returned ?? 0), 0)
  const fund = totalAdvanced - spent - totalReturned  // có thể âm nếu chi nhiều hơn ứng

  // Tách riêng theo từng giám sát viên — công trình có nhiều người cùng ứng tiền.
  const bySupervisor = supervisors
    .map(sv => {
      const svRows = rows.filter(r => r.employee_id === sv.id)
      const advanced = svRows.reduce((s, r) => s + r.amount, 0)
      const returned = svRows.reduce((s, r) => s + (r.returned ?? 0), 0)
      const svSpent = (spentItems ?? []).filter(it => it.advance_employee_id === sv.id).reduce((s, it) => s + it.amount, 0)
      return { ...sv, advanced, returned, spent: svSpent, remaining: advanced - svSpent - returned }
    })
    .filter(sv => sv.advanced > 0 || sv.spent > 0)
  const unassigned = {
    advanced: rows.filter(r => !r.employee_id).reduce((s, r) => s + r.amount, 0),
    returned: rows.filter(r => !r.employee_id).reduce((s, r) => s + (r.returned ?? 0), 0),
    spent: (spentItems ?? []).filter(it => !it.advance_employee_id).reduce((s, it) => s + it.amount, 0),
  }

  async function handleAdd() {
    if (!form.employeeId || !form.amount) { alert('Chọn người ứng và nhập số tiền.'); return }
    setSaving(true)
    const supabase = createClient()
    const personName = supervisors.find(s => s.id === form.employeeId)?.name ?? ''
    const { data, error } = await supabase.from('site_advances').insert({
      project_id: projectId, project: projectName, person: personName, employee_id: form.employeeId, channel: form.channel,
      amount: parseFloat(form.amount), spent: 0, returned: 0, date: form.date, note: form.note || null,
    }).select().single()
    setSaving(false)
    if (!error && data) {
      setRows([data as ProjectAdvance, ...rows]); setShowAdd(false)
      setForm(f => ({ ...f, employeeId: '', amount: '', note: '' }))
      router.refresh()
    } else if (error) {
      alert('Lỗi ghi tạm ứng:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
    }
  }

  async function handleReturn() {
    if (!returning || !returnAmount) return
    const add = parseFloat(returnAmount)
    if (isNaN(add) || add <= 0) return
    setSaving(true)
    const supabase = createClient()
    const newVal = (returning.returned ?? 0) + add
    const { error } = await supabase.from('site_advances').update({ returned: newVal }).eq('id', returning.id)
    setSaving(false)
    if (!error) {
      setRows(prev => prev.map(r => r.id === returning.id ? { ...r, returned: newVal } : r))
      setReturning(null); setReturnAmount(''); router.refresh()
    }
  }

  async function handleEdit() {
    if (!editing || !form.employeeId || !form.amount) { alert('Chọn người ứng và nhập số tiền.'); return }
    setSaving(true)
    const supabase = createClient()
    const personName = supervisors.find(s => s.id === form.employeeId)?.name ?? ''
    const { error } = await supabase.from('site_advances').update({
      person: personName, employee_id: form.employeeId, channel: form.channel,
      amount: parseFloat(form.amount), date: form.date, note: form.note || null,
    }).eq('id', editing.id)
    setSaving(false)
    if (!error) {
      setRows(prev => prev.map(r => r.id === editing.id ? { ...r, person: personName, employee_id: form.employeeId, channel: form.channel, amount: parseFloat(form.amount), date: form.date, note: form.note || null } : r))
      setEditing(null); router.refresh()
    } else {
      alert('Lỗi cập nhật:\n' + (error.message ?? ''))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa khoản tạm ứng này?')) return
    const supabase = createClient()
    await supabase.from('site_advances').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id)); router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-900">Tạm ứng CP giám sát công trình</h3>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700">
          <Plus size={13} /> Thêm khoản ứng
        </button>
      </div>

      {/* Summary quỹ */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-3">
          <p className="text-[11px] text-gray-500">Tổng đã ứng</p>
          <p className="text-base font-bold text-gray-800 tabular-nums">{formatVND(totalAdvanced)}</p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] text-gray-500">Đã chi từ quỹ</p>
            {!!spentItems?.length && (
              <button
                onClick={() => setShowSpentDetail(true)}
                title="Xem chi tiết các khoản đã chi từ quỹ"
                className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
              >
                <FileText size={10} /> Trích xuất
              </button>
            )}
          </div>
          <p className="text-base font-bold text-blue-700 tabular-nums">{formatVND(spent)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-gray-500">Số dư quỹ</p>
          <p className={`text-base font-bold tabular-nums ${fund >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatVND(fund)}
          </p>
          {fund < 0 && <p className="text-[9px] text-red-500">Công ty còn nợ (chi vượt ứng)</p>}
        </div>
      </div>

      {(bySupervisor.length > 0 || unassigned.advanced > 0 || unassigned.spent > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-amber-50/40 border-b border-gray-100">
          {bySupervisor.map(sv => (
            <div key={sv.id} className="bg-white rounded-xl border border-amber-100 p-3">
              <p className="text-sm font-semibold text-gray-800 mb-2">Quỹ {sv.name}</p>
              <div className="flex gap-4 text-xs">
                <div><p className="text-gray-500">Đã ứng</p><p className="font-bold text-gray-900 tabular-nums">{formatVND(sv.advanced)}</p></div>
                <div><p className="text-gray-500">Đã chi</p><p className="font-bold text-blue-700 tabular-nums">{formatVND(sv.spent)}</p></div>
                <div>
                  <p className="text-gray-500">Còn lại</p>
                  <p className={`font-bold tabular-nums ${sv.remaining >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatVND(sv.remaining)}</p>
                </div>
              </div>
            </div>
          ))}
          {(unassigned.advanced > 0 || unassigned.spent > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-500 mb-2">Chưa gán giám sát viên (dữ liệu cũ)</p>
              <div className="flex gap-4 text-xs">
                <div><p className="text-gray-500">Đã ứng</p><p className="font-bold text-gray-700 tabular-nums">{formatVND(unassigned.advanced)}</p></div>
                <div><p className="text-gray-500">Đã chi</p><p className="font-bold text-gray-700 tabular-nums">{formatVND(unassigned.spent)}</p></div>
                <div><p className="text-gray-500">Còn lại</p><p className="font-bold text-gray-700 tabular-nums">{formatVND(unassigned.advanced - unassigned.spent - unassigned.returned)}</p></div>
              </div>
            </div>
          )}
        </div>
      )}


      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400 text-center italic">Chưa có khoản ứng nào. Bấm "Thêm khoản ứng".</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.id} className="px-5 py-3 flex items-center gap-3 group hover:bg-gray-50/50">
              <span className="text-xs text-gray-400 tabular-nums w-20 shrink-0">
                {new Date(r.date + 'T00:00:00').toLocaleDateString('vi-VN')}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800">Ứng cho {r.person}</span>
                <span className="ml-2 text-xs text-gray-400">{CH_LABEL[r.channel] ?? r.channel}</span>
                {r.note && <span className="ml-1.5 text-xs text-gray-400">· {r.note}</span>}
                {r.returned > 0 && <span className="ml-2 text-xs text-green-600">đã trả lại {formatVNDShort(r.returned)}</span>}
              </div>
              <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatVND(r.amount)}</span>
              <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditing(r); setForm({ employeeId: r.employee_id ?? '', channel: r.channel, amount: String(r.amount), date: r.date, note: r.note || '' }) }}
                  className="p-1 text-gray-300 hover:text-blue-600 rounded">
                  <Pencil size={12} />
                </button>
                <button onClick={() => { setReturning(r); setReturnAmount('') }}
                  className="px-2 py-1 text-[10px] text-green-600 border border-green-200 rounded hover:bg-green-50 whitespace-nowrap">
                  Trả lại
                </button>
                <button onClick={() => handleDelete(r.id)} className="p-1 text-gray-300 hover:text-red-500 rounded">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="px-5 py-2.5 text-[11px] text-gray-400 bg-gray-50/50 border-t border-gray-50">
        Khi GS báo đã chi → thêm khoản chi bên trên, chọn Hình thức TT <strong>"GS chi từ quỹ đã ứng"</strong> → trừ vào quỹ, không trừ tiền công ty lần nữa.
      </p>

      {/* Modal: Add advance */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Thêm khoản ứng</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LBL}>Người ứng</label>
                <select className={INP} value={form.employeeId}
                  onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}>
                  <option value="">-- Chọn giám sát viên --</option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Số tiền ứng (₫)</label>
                  <input type="number" min="0" className={`${INP} text-right`} placeholder="0" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Ứng từ kênh</label>
                  <select className={INP} value={form.channel}
                    onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
                    <option value="tk_cty">TK Công ty</option>
                    <option value="tk_cn">TK Cá nhân</option>
                    <option value="tm">Tiền mặt</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Ngày ứng</label>
                  <input type="date" className={INP} value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Ghi chú</label>
                  <input className={INP} value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleAdd} disabled={saving}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Thêm khoản ứng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Return */}
      {returning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Ghi trả lại tiền ứng</h2>
            <p className="text-xs text-gray-600 mb-3">Ứng cho {returning.person} · {formatVND(returning.amount)}</p>
            <label className={LBL}>Số tiền {returning.person} trả lại (₫) — tiền về kênh</label>
            <input type="number" min="0" className={`${INP} text-right`} placeholder="0" value={returnAmount}
              onChange={e => setReturnAmount(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setReturning(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleReturn} disabled={saving || !returnAmount}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit advance */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Chỉnh sửa khoản ứng</h2>
              <button onClick={() => setEditing(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LBL}>Người ứng</label>
                <select className={INP} value={form.employeeId}
                  onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}>
                  <option value="">-- Chọn giám sát viên --</option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Số tiền ứng (₫)</label>
                  <input type="number" min="0" className={`${INP} text-right`} placeholder="0" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Ứng từ kênh</label>
                  <select className={INP} value={form.channel}
                    onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
                    <option value="tk_cty">TK Công ty</option>
                    <option value="tk_cn">TK Cá nhân</option>
                    <option value="tm">Tiền mặt</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Ngày ứng</label>
                  <input type="date" className={INP} value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Ghi chú</label>
                  <input className={INP} value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleEdit} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Cập nhật'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết đã chi từ quỹ */}
      {showSpentDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Chi tiết đã chi từ quỹ</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tổng <strong className="text-blue-700">
                    {formatVND(
                      spentFilterId === '' ? spent
                      : spentFilterId === '__unassigned__' ? (spentItems ?? []).filter(it => !it.advance_employee_id).reduce((s, it) => s + it.amount, 0)
                      : (spentItems ?? []).filter(it => it.advance_employee_id === spentFilterId).reduce((s, it) => s + it.amount, 0)
                    )}
                  </strong>
                </p>
              </div>
              <button onClick={() => setShowSpentDetail(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {supervisors.length > 0 && (
              <div className="px-6 py-2.5 border-b border-gray-100 shrink-0">
                <select className={INP} value={spentFilterId} onChange={e => setSpentFilterId(e.target.value)}>
                  <option value="">Tất cả giám sát viên</option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>Quỹ {s.name}</option>)}
                  <option value="__unassigned__">Chưa gán giám sát viên</option>
                </select>
              </div>
            )}

            <div className="overflow-y-auto divide-y divide-gray-50">
              {(() => {
                const filtered = (spentItems ?? []).filter(it => {
                  if (spentFilterId === '') return true
                  if (spentFilterId === '__unassigned__') return !it.advance_employee_id
                  return it.advance_employee_id === spentFilterId
                })
                if (filtered.length === 0) return <p className="px-5 py-6 text-sm text-gray-400 text-center italic">Không có khoản chi nào khớp bộ lọc.</p>
                return filtered.map(it => (
                <div key={it.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-xs text-gray-400 tabular-nums w-20 shrink-0">
                    {new Date(it.date + 'T00:00:00').toLocaleDateString('vi-VN')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{it.description}</span>
                    {it.category_name && <span className="ml-2 text-xs text-gray-400">{it.category_name}</span>}
                    {it.is_labor && <span className="ml-1.5 text-xs text-purple-500">· Nhân công</span>}
                    {it.supplier && <span className="ml-1.5 text-xs text-gray-400">· {it.supplier}</span>}
                    {it.advance_employee_id && (
                      <span className="ml-1.5 text-xs text-amber-600">· Quỹ {supervisors.find(s => s.id === it.advance_employee_id)?.name ?? '?'}</span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatVND(it.amount)}</span>
                </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
