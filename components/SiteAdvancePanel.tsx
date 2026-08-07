'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatVND, formatVNDShort } from '@/lib/utils'
import { X, Trash2, Plus } from 'lucide-react'

export interface SiteAdvance {
  id: string
  person: string
  project?: string | null
  channel: string
  date: string
  amount: number
  spent: number
  returned: number
  note?: string | null
}

const CH_LABEL: Record<string, string> = { tk_cty: 'TK Công ty', tk_cn: 'TK Cá nhân', tm: 'Tiền mặt', ocb: 'OCB', lp: 'LPBank', mb: 'MB' }
const INP = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none'
const LBL = 'block text-xs font-medium text-gray-600 mb-1'

export default function SiteAdvancePanel({ initial }: { initial: SiteAdvance[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [showAdd, setShowAdd] = useState(false)
  const [settle, setSettle] = useState<{ row: SiteAdvance; type: 'spent' | 'returned' } | null>(null)
  const [settleAmount, setSettleAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    person: '', project: '', channel: 'tk_cn', amount: '',
    date: new Date().toISOString().split('T')[0], note: '',
  })

  const remainOf = (r: SiteAdvance) => Math.max(0, r.amount - (r.returned ?? 0))
  const totalHolding = rows.reduce((s, r) => s + remainOf(r), 0)

  async function handleAdd() {
    if (!form.person || !form.amount) { alert('Nhập tên người ứng và số tiền.'); return }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('site_advances').insert({
      person: form.person, project: form.project || null, channel: form.channel,
      amount: parseFloat(form.amount), spent: 0, returned: 0, date: form.date, note: form.note || null,
    }).select().single()
    setSaving(false)
    if (!error && data) {
      setRows([data as SiteAdvance, ...rows]); setShowAdd(false)
      setForm(f => ({ ...f, person: '', project: '', amount: '', note: '' }))
      router.refresh()
    } else if (error) {
      alert('Lỗi ghi tạm ứng:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
    }
  }

  async function handleSettle() {
    if (!settle || !settleAmount) return
    const add = parseFloat(settleAmount)
    if (isNaN(add) || add <= 0) return
    setSaving(true)
    const supabase = createClient()
    const field = settle.type
    const newVal = (settle.row[field] ?? 0) + add
    const { error } = await supabase.from('site_advances').update({ [field]: newVal }).eq('id', settle.row.id)
    setSaving(false)
    if (!error) {
      setRows(prev => prev.map(r => r.id === settle.row.id ? { ...r, [field]: newVal } : r))
      setSettle(null); setSettleAmount(''); router.refresh()
    } else {
      alert('Lỗi:\n' + (error.message ?? ''))
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
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Tạm ứng công trình</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Ứng = tiền RA khỏi kênh nguồn · chưa hoàn lại: <strong className="text-orange-600">{formatVNDShort(totalHolding)}</strong>
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700">
          <Plus size={13} /> Ghi tạm ứng
        </button>
      </div>

      {rows.length === 0 ? (
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
                <th className="px-3 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => {
                const remaining = remainOf(r)
                const done = remaining <= 0
                return (
                  <tr key={r.id} className="hover:bg-gray-50/50 group">
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
                        {!done && (
                          <button onClick={() => { setSettle({ row: r, type: 'returned' }); setSettleAmount('') }}
                            className="px-2 py-1 text-[10px] text-green-600 border border-green-200 rounded hover:bg-green-50 whitespace-nowrap">
                            Trả lại
                          </button>
                        )}
                        <button onClick={() => handleDelete(r.id)} className="p-1 text-gray-300 hover:text-red-500 rounded">
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

      {/* Modal: Add advance */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Ghi tạm ứng công trình</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Người ứng</label>
                  <input className={INP} placeholder="VD: Hiếu" value={form.person}
                    onChange={e => setForm(f => ({ ...f, person: e.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Công trình (tuỳ chọn)</label>
                  <input className={INP} placeholder="VD: SHOP MOVA" value={form.project}
                    onChange={e => setForm(f => ({ ...f, project: e.target.value }))} />
                </div>
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
              <p className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 rounded-lg p-2.5">
                Khi ứng, dòng tiền tự trừ kênh nguồn. Chi phí nhân viên báo → nhập cho công trình nhưng
                <strong> để trống Hình thức TT</strong> (không trừ tiền lần nữa). Bấm "Ghi chi phí" / "Trả lại" để tất toán.
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleAdd} disabled={saving}
                className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Ghi tạm ứng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Settle (spent / returned) */}
      {settle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              {settle.type === 'spent' ? 'Ghi chi phí đã báo' : 'Ghi trả lại tiền'}
            </h2>
            <p className="text-xs text-gray-600 mb-3">{settle.row.person}{settle.row.project ? ` · ${settle.row.project}` : ''}</p>
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Đã ứng:</span><span className="font-medium">{formatVND(settle.row.amount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Còn giữ:</span><span className="font-bold text-orange-600">{formatVND(remainOf(settle.row))}</span></div>
            </div>
            <label className={LBL}>
              {settle.type === 'spent' ? 'Số tiền đã chi (chỉ vào giá thành, không trừ tiền)' : 'Số tiền trả lại (tiền về kênh)'} (₫)
            </label>
            <input type="number" min="0" className={`${INP} text-right`} placeholder="0" value={settleAmount}
              onChange={e => setSettleAmount(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setSettle(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleSettle} disabled={saving || !settleAmount}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${settle.type === 'spent' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {saving ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
