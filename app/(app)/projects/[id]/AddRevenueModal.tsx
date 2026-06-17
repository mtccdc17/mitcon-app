'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Contract } from '@/lib/types'
import { X } from 'lucide-react'

interface Props {
  projectId: string
  contracts: Contract[]
  userId: string
  onClose: () => void
}

export default function AddRevenueModal({ projectId, contracts, userId, onClose }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)

    const { error } = await supabase.from('revenue').insert({
      project_id: projectId,
      contract_id: form.get('contract_id') as string || null,
      stage: form.get('stage') as string,
      amount: parseInt(form.get('amount') as string || '0', 10),
      collected_date: form.get('collected_date') as string || null,
      payment_method: form.get('payment_method') as string || 'Chuyển khoản',
      status: form.get('status') as string || 'pending',
      note: form.get('note') as string || null,
      created_by: userId,
    })

    if (!error) onClose()
    else { alert('Lỗi khi lưu. Vui lòng thử lại.'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Thêm đợt thu tiền</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Đợt thu <span className="text-red-500">*</span></label>
              <input name="stage" required placeholder="VD: Đợt 1 - 30%" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hợp đồng</label>
              <select name="contract_id" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Không có --</option>
                {contracts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.type === 'vat' ? 'HĐ Xuất VAT' : 'HĐ Không HĐ'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND) <span className="text-red-500">*</span></label>
            <input name="amount" type="number" required min="0" step="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày thu</label>
              <input name="collected_date" type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái</label>
              <select name="status" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="pending">Chưa thu</option>
                <option value="collected">Đã thu</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hình thức</label>
              <select name="payment_method" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="Chuyển khoản">Chuyển khoản</option>
                <option value="Tiền mặt">Tiền mặt</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
              <input name="note" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
