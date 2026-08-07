'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatVND } from '@/lib/utils'
import { fetchCashflowLedger, LedgerEntry } from '@/lib/cashflowLedger'
import { History, X } from 'lucide-react'

const CHANNEL_LABEL: Record<string, string> = { tk_cty: 'TK Công ty', tk_cn: 'TK Cá nhân', tm: 'Tiền mặt' }
const CHANNEL_STYLE: Record<string, string> = {
  tk_cty: 'bg-blue-100 text-blue-700', tk_cn: 'bg-purple-100 text-purple-700', tm: 'bg-amber-100 text-amber-700',
}
const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

type Period = 'ngay' | 'thang' | 'nam'

export default function CashflowHistoryModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null)

  const now = new Date()
  const [period, setPeriod] = useState<Period>('thang')
  const [day, setDay] = useState(now.toISOString().slice(0, 10))
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [channel, setChannel] = useState<'all' | 'tk_cty' | 'tk_cn' | 'tm'>('all')

  async function handleOpen() {
    setOpen(true)
    if (entries) return
    setLoading(true)
    const supabase = createClient()
    const data = await fetchCashflowLedger(supabase)
    setEntries(data)
    setLoading(false)
  }

  async function handleRefresh() {
    setLoading(true)
    const supabase = createClient()
    const data = await fetchCashflowLedger(supabase)
    setEntries(data)
    setLoading(false)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const inPeriod = (date: string) => {
    if (period === 'ngay') return date === day
    if (period === 'thang') return date.slice(0, 7) === `${year}-${pad(month)}`
    return date.slice(0, 4) === String(year)
  }

  const filtered = (entries ?? [])
    .filter(e => inPeriod(e.date))
    .filter(e => channel === 'all' || e.channel === channel)

  const totalIn = filtered.filter(e => e.direction === 'in').reduce((s, e) => s + e.amount, 0)
  const totalOut = filtered.filter(e => e.direction === 'out').reduce((s, e) => s + e.amount, 0)

  return (
    <>
      <button onClick={handleOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800">
        <History size={13} /> Lịch sử chi trả
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Lịch sử chi trả — 3 dòng tiền</h2>
                <p className="text-xs text-gray-500 mt-0.5">Gom từ mọi nguồn: doanh thu, giao dịch công trình, lương, BHXH/TNCN, chi vận hành, chuyển kênh, tạm ứng...</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
                {([['ngay','Ngày'],['thang','Tháng'],['nam','Năm']] as [Period,string][]).map(([v, l]) => (
                  <button key={v} onClick={() => setPeriod(v)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      period === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>{l}</button>
                ))}
              </div>
              {period === 'ngay' && (
                <input type="date" value={day} onChange={e => setDay(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
              )}
              {period === 'thang' && (
                <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                  {MONTH_VN.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              )}
              {(period === 'thang' || period === 'nam') && (
                <select value={year} onChange={e => setYear(parseInt(e.target.value))}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                  {[year-1, year, year+1].map(y => <option key={y} value={y}>Năm {y}</option>)}
                </select>
              )}
              <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1 ml-auto">
                {([['all','Tất cả'],['tk_cty','TK Công ty'],['tk_cn','TK Cá nhân'],['tm','Tiền mặt']] as [typeof channel,string][]).map(([v, l]) => (
                  <button key={v} onClick={() => setChannel(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      channel === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>{l}</button>
                ))}
              </div>
              <button onClick={handleRefresh} disabled={loading}
                className="px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {loading ? '...' : 'Tải lại'}
              </button>
            </div>

            <div className="px-6 py-2.5 border-b border-gray-100 flex items-center gap-5 bg-gray-50/60">
              <span className="text-xs text-gray-500">
                Thu vào: <strong className="text-green-700 tabular-nums">{formatVND(totalIn)}</strong>
              </span>
              <span className="text-xs text-gray-500">
                Chi ra: <strong className="text-red-600 tabular-nums">{formatVND(totalOut)}</strong>
              </span>
              <span className="text-xs text-gray-500">
                Chênh lệch: <strong className={`tabular-nums ${totalIn - totalOut >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatVND(totalIn - totalOut)}</strong>
              </span>
              <span className="text-xs text-gray-400 ml-auto">{filtered.length} khoản</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="px-6 py-10 text-center text-sm text-gray-400">Đang tải...</p>
              ) : filtered.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-400 italic">Không có khoản nào trong kỳ này.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-2 text-xs font-semibold text-gray-500">Ngày</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Kênh</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Loại</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Nội dung</th>
                      <th className="text-right px-6 py-2 text-xs font-semibold text-gray-500">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-2.5 text-xs text-gray-500 whitespace-nowrap tabular-nums">
                          {new Date(e.date + 'T00:00:00').toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_STYLE[e.channel]}`}>
                            {CHANNEL_LABEL[e.channel]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{e.category}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-800">{e.description}</td>
                        <td className="px-6 py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                          <span className={e.direction === 'in' ? 'text-green-700' : 'text-red-600'}>
                            {e.direction === 'in' ? '+' : '−'}{formatVND(e.amount)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
