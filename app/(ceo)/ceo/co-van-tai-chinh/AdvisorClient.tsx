'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatVND } from '@/lib/utils'
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import CashflowBox, { type CashflowData } from '@/components/CashflowBox'
import type { FinancialCheckResult } from '@/lib/financialAdvisor'

const RISK_UI = {
  an_toan: { label: 'AN TOÀN', bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2, iconColor: 'text-green-600' },
  canh_bao: { label: 'CẢNH BÁO', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: AlertTriangle, iconColor: 'text-amber-600' },
  nguy_hiem: { label: 'NGUY HIỂM', bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: ShieldAlert, iconColor: 'text-red-600' },
} as const

export default function AdvisorClient({
  result, cashflow, generatedAt,
}: { result: FinancialCheckResult; cashflow: CashflowData; generatedAt: string }) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/financial-check', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert('Lỗi khi làm mới: ' + (body.error ?? res.statusText))
        return
      }
      router.refresh()
    } catch {
      alert('Lỗi kết nối. Thử lại sau.')
    } finally {
      setRefreshing(false)
    }
  }

  const ui = RISK_UI[result.riskLevel]
  const Icon = ui.icon

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles size={20} className="text-purple-600" /> Cố vấn tài chính AI
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cập nhật lúc {new Date(generatedAt).toLocaleString('vi-VN')}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Đang tính lại...' : 'Làm mới đánh giá'}
        </button>
      </div>

      {/* Banner rủi ro */}
      <div className={`rounded-2xl border p-5 ${ui.bg}`}>
        <div className="flex items-start gap-3">
          <Icon size={28} className={ui.iconColor} />
          <div className="flex-1">
            <p className={`text-sm font-bold ${ui.text}`}>{ui.label}</p>
            <p className="text-2xl font-black tabular-nums text-gray-900 mt-1">
              Quỹ dư sau khi trừ nợ thuế+BHXH: {formatVND(result.buffer)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Tiền mặt hiện có {formatVND(result.cashOnHand)} − nghĩa vụ còn thiếu lũy kế {formatVND(result.obligations.tongConThieu)}
            </p>
          </div>
        </div>
      </div>

      {/* Breakdown 3 khoản */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {result.obligations.items.map(item => (
          <div key={item.kind} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-2">{item.label}</p>
            <div className="flex gap-5 text-xs">
              <div><p className="text-gray-500">Phải nộp</p><p className="font-bold text-gray-900 tabular-nums">{formatVND(item.phaiNop)}</p></div>
              <div><p className="text-gray-500">Đã nộp</p><p className="font-bold text-green-700 tabular-nums">{formatVND(item.daNop)}</p></div>
              <div>
                <p className="text-gray-500">Còn thiếu</p>
                <p className={`font-bold tabular-nums ${item.conThieu > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatVND(item.conThieu)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tiền mặt hiện có */}
      <CashflowBox cashflow={cashflow} />

      {/* Tư vấn AI */}
      <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl border border-purple-100 p-5">
        <p className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-1.5">
          <Sparkles size={15} /> Tư vấn từ AI
        </p>
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{result.adviceText}</p>
      </div>

      <p className="text-xs text-gray-400">
        Số liệu tự tính từ dữ liệu hiện có trong app (không phụ thuộc báo cáo kế toán thuế) — công trình cũ chưa nhập đủ sẽ được tính bổ sung khi Sếp cập nhật dữ liệu.
      </p>
    </div>
  )
}
