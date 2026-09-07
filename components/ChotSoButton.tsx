'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Settings, X, Trash2 } from 'lucide-react'
import { formatVNDShort } from '@/lib/utils'

export interface ChotSoSettings {
  closing_date: string | null
  opening_tk_cty: number
  opening_tk_cn: number
  opening_tm: number
}

export interface ClosingLog {
  id: string
  closing_date: string
  opening_tk_cty: number
  opening_tk_cn: number
  opening_tm: number
  note: string | null
  created_at: string
}

const INP = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-right tabular-nums'
const LBL = 'block text-xs font-medium text-gray-600 mb-1'

export default function ChotSoButton({ initial, history = [] }: { initial: ChotSoSettings | null; history?: ClosingLog[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    closing_date: initial?.closing_date ?? new Date().toISOString().split('T')[0],
    opening_tk_cty: initial ? String(initial.opening_tk_cty) : '',
    opening_tk_cn:  initial ? String(initial.opening_tk_cn)  : '',
    opening_tm:     initial ? String(initial.opening_tm)     : '',
    note: '',
  })

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const row = {
      closing_date: form.closing_date || null,
      opening_tk_cty: parseFloat(form.opening_tk_cty) || 0,
      opening_tk_cn:  parseFloat(form.opening_tk_cn)  || 0,
      opening_tm:     parseFloat(form.opening_tm)     || 0,
    }
    const { error } = await supabase.from('cashflow_settings').upsert({
      id: 1, ...row, updated_at: new Date().toISOString(),
    })
    if (!error && form.closing_date) {
      // Ghi thêm 1 dòng vào lịch sử chốt sổ (không chặn nếu lỗi — cashflow_settings mới là bản áp dụng)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('cashflow_closings').insert({ ...row, note: form.note.trim() || null, created_by: user?.id ?? null })
    }
    setSaving(false)
    if (!error) {
      setForm(f => ({ ...f, note: '' }))
      setOpen(false)
      router.refresh()
    } else {
      alert('Lỗi chốt sổ:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
    }
  }

  async function deleteLog(id: string) {
    if (!confirm('Xóa dòng lịch sử chốt sổ này? (không ảnh hưởng mốc chốt đang áp dụng)')) return
    const supabase = createClient()
    const { error } = await supabase.from('cashflow_closings').delete().eq('id', id)
    if (error) { alert('Lỗi: ' + error.message); return }
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Settings size={14} /> Chốt sổ
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-gray-900">Chốt sổ — Số dư đầu kỳ</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Nhập <strong>số dư NGÂN HÀNG/tiền mặt THẬT</strong> của 3 kênh tại ngày chốt. App sẽ tự trừ các khoản chi
              chưa trả phát sinh sau đó. Giao dịch đã thanh toán trước ngày chốt được bỏ qua (đã nằm trong số dư này).
            </p>
            <div className="space-y-3">
              <div>
                <label className={LBL}>Ngày chốt sổ</label>
                <input type="date" className={`${INP} text-left`} value={form.closing_date}
                  onChange={e => setForm(f => ({ ...f, closing_date: e.target.value }))} />
              </div>
              <div>
                <label className={LBL}>🏦 Số dư TK Công ty (₫)</label>
                <input type="number" className={INP} placeholder="0" value={form.opening_tk_cty}
                  onChange={e => setForm(f => ({ ...f, opening_tk_cty: e.target.value }))} />
              </div>
              <div>
                <label className={LBL}>💳 Số dư TK Cá nhân (₫)</label>
                <input type="number" className={INP} placeholder="0" value={form.opening_tk_cn}
                  onChange={e => setForm(f => ({ ...f, opening_tk_cn: e.target.value }))} />
              </div>
              <div>
                <label className={LBL}>💵 Tiền mặt thực tế (₫)</label>
                <input type="number" className={INP} placeholder="0" value={form.opening_tm}
                  onChange={e => setForm(f => ({ ...f, opening_tm: e.target.value }))} />
              </div>
              <div>
                <label className={LBL}>Ghi chú (tuỳ chọn)</label>
                <input type="text" className={`${INP} text-left`} placeholder="VD: Chốt cuối Q3/2026"
                  value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu chốt sổ'}
              </button>
            </div>

            {history.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Lịch sử chốt sổ</p>
                <div className="space-y-1.5">
                  {history.map((h, i) => (
                    <div key={h.id} className={`text-xs rounded-lg px-2.5 py-1.5 group flex items-start justify-between gap-2 ${i === 0 ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-gray-800 tabular-nums">
                            {new Date(h.closing_date).toLocaleDateString('vi-VN')}
                          </span>
                          {i === 0 && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">đang áp dụng</span>}
                        </div>
                        <div className="text-gray-500 tabular-nums mt-0.5">
                          🏦 {formatVNDShort(h.opening_tk_cty)} · 💳 {formatVNDShort(h.opening_tk_cn)} · 💵 {formatVNDShort(h.opening_tm)}
                        </div>
                        {h.note && <div className="text-gray-400 mt-0.5 truncate">{h.note}</div>}
                        <div className="text-[10px] text-gray-300 mt-0.5">
                          ghi {new Date(h.created_at).toLocaleString('vi-VN')}
                        </div>
                      </div>
                      <button onClick={() => deleteLog(h.id)}
                        className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
