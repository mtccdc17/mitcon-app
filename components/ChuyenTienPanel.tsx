'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatVND } from '@/lib/utils'
import { ArrowLeftRight, X, Trash2, Plus, Pencil } from 'lucide-react'

export interface Transfer {
  id: string
  from_channel: string
  to_channel: string
  amount: number
  date: string
  note?: string | null
}

const CH_LABEL: Record<string, string> = { tk_cty: 'TK Công ty', tk_cn: 'TK Cá nhân', tm: 'Tiền mặt' }
const INP = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none'
const LBL = 'block text-xs font-medium text-gray-600 mb-1'

export default function ChuyenTienPanel({ initial }: { initial: Transfer[] }) {
  const router = useRouter()
  const [transfers, setTransfers] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    from_channel: 'tk_cty', to_channel: 'tm', amount: '',
    date: new Date().toISOString().split('T')[0], note: '',
  })

  function openAdd() {
    setEditingId(null)
    setForm({ from_channel: 'tk_cty', to_channel: 'tm', amount: '', date: new Date().toISOString().split('T')[0], note: '' })
    setOpen(true)
  }

  function openEdit(t: Transfer) {
    setEditingId(t.id)
    setForm({ from_channel: t.from_channel, to_channel: t.to_channel, amount: String(t.amount), date: t.date, note: t.note ?? '' })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.amount || form.from_channel === form.to_channel) {
      alert('Chọn 2 kênh khác nhau và nhập số tiền.'); return
    }
    setSaving(true)
    const supabase = createClient()
    const payload = {
      from_channel: form.from_channel, to_channel: form.to_channel,
      amount: parseFloat(form.amount), date: form.date, note: form.note || null,
    }
    if (editingId) {
      const { data, error } = await supabase.from('channel_transfers').update(payload).eq('id', editingId).select().single()
      setSaving(false)
      if (!error && data) {
        setTransfers(prev => prev.map(t => t.id === editingId ? (data as Transfer) : t))
        setOpen(false)
        router.refresh()
      } else if (error) {
        alert('Lỗi sửa chuyển tiền:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
      }
      return
    }
    const { data, error } = await supabase.from('channel_transfers').insert(payload).select().single()
    setSaving(false)
    if (!error && data) {
      setTransfers([data as Transfer, ...transfers])
      setOpen(false)
      setForm(f => ({ ...f, amount: '', note: '' }))
      router.refresh()
    } else if (error) {
      alert('Lỗi chuyển tiền:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa lệnh chuyển này?')) return
    const supabase = createClient()
    await supabase.from('channel_transfers').delete().eq('id', id)
    setTransfers(prev => prev.filter(t => t.id !== id))
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Chuyển tiền nội bộ</h3>
          <p className="text-xs text-gray-500 mt-0.5">Dời tiền giữa TK Công ty / TK Cá nhân / Tiền mặt (gồm rút mặt từ TK)</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
          <Plus size={13} /> Chuyển tiền
        </button>
      </div>

      {transfers.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center italic">Chưa có lệnh chuyển nào.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {transfers.map(t => (
            <div key={t.id} className="px-5 py-3 flex items-center gap-3 group hover:bg-gray-50/50">
              <span className="text-xs text-gray-400 tabular-nums w-20 shrink-0">
                {new Date(t.date + 'T00:00:00').toLocaleDateString('vi-VN')}
              </span>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-700">{CH_LABEL[t.from_channel] ?? t.from_channel}</span>
                <ArrowLeftRight size={12} className="text-gray-400 shrink-0" />
                <span className="text-xs font-medium text-gray-700">{CH_LABEL[t.to_channel] ?? t.to_channel}</span>
                {t.note && <span className="text-xs text-gray-400 truncate">· {t.note}</span>}
              </div>
              <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatVND(t.amount)}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(t)}
                  className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(t.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">{editingId ? 'Sửa lệnh chuyển tiền' : 'Chuyển tiền nội bộ'}</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Từ kênh</label>
                  <select className={INP} value={form.from_channel}
                    onChange={e => setForm(f => ({ ...f, from_channel: e.target.value }))}>
                    <option value="tk_cty">TK Công ty</option>
                    <option value="tk_cn">TK Cá nhân</option>
                    <option value="tm">Tiền mặt</option>
                  </select>
                </div>
                <div>
                  <label className={LBL}>Đến kênh</label>
                  <select className={INP} value={form.to_channel}
                    onChange={e => setForm(f => ({ ...f, to_channel: e.target.value }))}>
                    <option value="tm">Tiền mặt</option>
                    <option value="tk_cty">TK Công ty</option>
                    <option value="tk_cn">TK Cá nhân</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Số tiền (₫)</label>
                  <input type="number" min="0" className={`${INP} text-right`} placeholder="0" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Ngày</label>
                  <input type="date" className={INP} value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={LBL}>Ghi chú (tuỳ chọn)</label>
                <input type="text" className={INP} placeholder="VD: rút tiền mặt trả NCC..." value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
