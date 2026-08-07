'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Settings, X } from 'lucide-react'

export interface ChotSoSettings {
  closing_date: string | null
  opening_tk_cty: number
  opening_tk_cn: number
  opening_tm: number
}

const INP = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-right tabular-nums'
const LBL = 'block text-xs font-medium text-gray-600 mb-1'

export default function ChotSoButton({ initial }: { initial: ChotSoSettings | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    closing_date: initial?.closing_date ?? new Date().toISOString().split('T')[0],
    opening_tk_cty: initial ? String(initial.opening_tk_cty) : '',
    opening_tk_cn:  initial ? String(initial.opening_tk_cn)  : '',
    opening_tm:     initial ? String(initial.opening_tm)     : '',
  })

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('cashflow_settings').upsert({
      id: 1,
      closing_date: form.closing_date || null,
      opening_tk_cty: parseFloat(form.opening_tk_cty) || 0,
      opening_tk_cn:  parseFloat(form.opening_tk_cn)  || 0,
      opening_tm:     parseFloat(form.opening_tm)     || 0,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (!error) {
      setOpen(false)
      router.refresh()
    } else {
      alert('Lỗi chốt sổ:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
    }
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
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
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu chốt sổ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
