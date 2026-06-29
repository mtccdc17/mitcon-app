'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'

const STAGE_PRESETS = ['Tạm ứng 1', 'Tạm ứng 2', 'Tạm ứng 3', 'Quyết toán', 'Thu phụ']
const CONTRACT_LABEL: Record<string, string> = { vat: 'HĐ Xuất VAT', no_vat: 'HĐ Không VAT' }

interface Project { id: string; name: string }
interface ContractRow { id: string; project_id: string; type: string; value: number }

interface Props {
  projects: Project[]
  contracts: ContractRow[]
  defaultProjectId?: string
  userId: string
  onClose: () => void
}

export default function AddRevenueEntryModal({ projects, contracts, defaultProjectId, userId, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? '')

  const projectContracts = contracts.filter(c => c.project_id === selectedProjectId)
  const hasMultipleContracts = projectContracts.length > 1

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)

    const contractId = form.get('contract_id') as string || null
    const autoContractId = projectContracts.length === 1 ? projectContracts[0].id : contractId

    const { error } = await supabase.from('revenue').insert({
      project_id: selectedProjectId,
      contract_id: autoContractId || null,
      stage: form.get('stage') as string,
      amount: parseInt(form.get('amount') as string || '0', 10),
      collected_date: form.get('collected_date') as string || null,
      payment_method: form.get('payment_method') as string || 'Chuyển khoản',
      status: form.get('status') as string || 'pending',
      note: form.get('note') as string || null,
      created_by: userId,
    })

    if (!error) {
      router.refresh()
      onClose()
    } else {
      alert('Lỗi khi lưu. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Thêm đợt thu tiền</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Công trình <span className="text-red-500">*</span></label>
            <select
              name="project_id"
              required
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Chọn công trình --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {hasMultipleContracts && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Loại hợp đồng <span className="text-red-500">*</span></label>
              <select
                name="contract_id"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn loại HĐ --</option>
                {projectContracts.map(c => (
                  <option key={c.id} value={c.id}>
                    {CONTRACT_LABEL[c.type] ?? c.type} — {c.value.toLocaleString('vi-VN')}₫
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedProjectId && !hasMultipleContracts && projectContracts.length === 1 && (
            <p className="text-xs text-gray-400 -mt-1">
              Tự động gắn: <span className="font-medium text-gray-600">{CONTRACT_LABEL[projectContracts[0].type] ?? projectContracts[0].type}</span>
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Đợt thu <span className="text-red-500">*</span></label>
            <input
              name="stage"
              required
              value={stage}
              onChange={e => setStage(e.target.value)}
              placeholder="VD: Tạm ứng 1, Quyết toán..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {STAGE_PRESETS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    stage === s
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND) <span className="text-red-500">*</span></label>
            <input
              name="amount"
              type="number"
              required
              min="0"
              step="1"
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày thu</label>
              <input
                name="collected_date"
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái</label>
              <select
                name="status"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Chưa thu</option>
                <option value="collected">Đã thu</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hình thức</label>
              <select
                name="payment_method"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Chuyển khoản">Chuyển khoản</option>
                <option value="Tiền mặt">Tiền mặt</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
              <input
                name="note"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
