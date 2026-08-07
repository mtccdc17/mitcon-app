'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatVND } from '@/lib/utils'
import { computeCashflow } from '@/lib/cashflow'
import type { CashflowData } from './CashflowBox'
import { CalendarClock, X } from 'lucide-react'

const CHANNEL_LABEL: Record<'tk_cty' | 'tk_cn' | 'tm', string> = {
  tk_cty: 'TK Công ty', tk_cn: 'TK Cá nhân', tm: 'Tiền mặt',
}

export default function CashflowAsOfModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [result, setResult] = useState<CashflowData | null>(null)

  async function handleQuery() {
    setLoading(true)
    const supabase = createClient()
    const data = await computeCashflow(supabase, date)
    setResult(data)
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => { setOpen(true); if (!result) handleQuery() }}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800">
        <CalendarClock size={13} /> Số dư tại ngày
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Số dư dòng tiền tại 1 ngày</h2>
                <p className="text-xs text-gray-500 mt-0.5">Tính đến hết ngày đã chọn — chỉ đếm khoản có ngày settle thật ≤ ngày này.</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleQuery}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
                >
                  {loading ? 'Đang tính...' : 'Xem'}
                </button>
              </div>

              {result && (
                <div className="space-y-2">
                  {(['tk_cty', 'tk_cn', 'tm'] as const).map(ch => (
                    <div key={ch} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                      <span className="text-sm font-medium text-gray-700">{CHANNEL_LABEL[ch]}</span>
                      <span className={`text-sm font-bold tabular-nums ${result[ch].net < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatVND(result[ch].net)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                    <span className="text-sm font-semibold text-blue-800">Tổng cộng</span>
                    <span className="text-sm font-bold tabular-nums text-blue-800">
                      {formatVND(result.tk_cty.net + result.tk_cn.net + result.tm.net)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
                    Lưu ý: khoản &quot;nợ chưa trả&quot;/&quot;tạm ứng còn giữ&quot; dùng trạng thái HIỆN TẠI trong hệ thống
                    (không lưu lịch sử theo ngày), nên chỉ mang tính tham khảo khi tra ngày quá khứ — số dư thực
                    (net) ở trên vẫn chính xác vì chỉ dựa trên ngày settle thật.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
