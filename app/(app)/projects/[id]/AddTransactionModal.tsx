'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Category, UserRole } from '@/lib/types'
import { calcVAT, calcTNCN } from '@/lib/utils'
import { X } from 'lucide-react'

interface Props {
  projectId: string
  contractId: string
  categories: Category[]
  userId: string
  userName: string
  role: UserRole
  onClose: () => void
}

const UNIT_OPTIONS: Record<UserRole, string> = {
  ceo: 'CEO',
  ketoan: 'Kế Toán',
  thicong: 'Thi Công',
  thumua: 'Thu Mua',
}

export default function AddTransactionModal({ projectId, contractId, categories, userId, userName, role, onClose }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [isLabor, setIsLabor] = useState(false)
  const [vatRate, setVatRate] = useState<'vat_10' | 'vat_8' | 'no_vat'>('no_vat')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)

    const amount = parseInt(form.get('amount') as string || '0', 10)
    const vat_amount = isLabor ? 0 : calcVAT(amount, vatRate)
    const tncn_amount = isLabor ? calcTNCN(amount) : 0

    const { error } = await supabase.from('transactions').insert({
      project_id: projectId,
      contract_id: contractId || null,
      category_id: form.get('category_id') as string || null,
      transaction_date: form.get('transaction_date') as string,
      unit: UNIT_OPTIONS[role],
      description: form.get('description') as string,
      amount,
      vat_rate: isLabor ? 'no_vat' : vatRate,
      vat_amount,
      tncn_amount,
      actual_paid: amount - vat_amount,
      is_labor: isLabor,
      labor_contract_status: isLabor ? (form.get('labor_contract_status') as string || 'not_signed') : 'not_signed',
      invoice_status: isLabor ? 'no_invoice' : (form.get('invoice_status') as string || 'no_invoice'),
      invoice_number: form.get('invoice_number') as string || null,
      supplier: form.get('supplier') as string || null,
      payment_status: form.get('payment_status') as string || 'pending',
      payment_date: form.get('payment_date') as string || null,
      created_by: userId,
    })

    if (!error) onClose()
    else { alert('Lỗi khi lưu. Vui lòng thử lại.'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Thêm khoản chi</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Labor toggle */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <button
              type="button"
              onClick={() => setIsLabor(false)}
              className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${!isLabor ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Vật tư
            </button>
            <button
              type="button"
              onClick={() => setIsLabor(true)}
              className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${isLabor ? 'bg-pink-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Nhân công
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày <span className="text-red-500">*</span></label>
              <input name="transaction_date" type="date" required defaultValue={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hạng mục</label>
              <select name="category_id" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Không có --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nội dung <span className="text-red-500">*</span></label>
            <input name="description" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Mô tả khoản chi..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND) <span className="text-red-500">*</span></label>
            <input name="amount" type="number" required min="0" step="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
          </div>

          {!isLabor && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Loại VAT</label>
                  <select value={vatRate} onChange={e => setVatRate(e.target.value as typeof vatRate)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="no_vat">Không VAT</option>
                    <option value="vat_10">VAT 10%</option>
                    <option value="vat_8">VAT 8%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tình trạng hóa đơn</label>
                  <select name="invoice_status"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="no_invoice">Không có HĐ</option>
                    <option value="waiting">Chờ xuất HĐ</option>
                    <option value="has_invoice">Đã có HĐ</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Số hóa đơn</label>
                  <input name="invoice_number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nhà cung cấp</label>
                  <input name="supplier" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </>
          )}

          {isLabor && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tình trạng hợp đồng nhân công</label>
              <select name="labor_contract_status"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="not_signed">Chưa làm hợp đồng</option>
                <option value="signed">Đã làm hợp đồng</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tình trạng thanh toán</label>
              <select name="payment_status"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="pending">Chưa thanh toán</option>
                <option value="partial">Thanh toán một phần</option>
                <option value="paid">Đã thanh toán</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày thanh toán</label>
              <input name="payment_date" type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
