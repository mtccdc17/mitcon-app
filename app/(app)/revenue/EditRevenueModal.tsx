'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Trash2 } from 'lucide-react'

const STAGE_PRESETS = ['Tạm ứng 1', 'Tạm ứng 2', 'Tạm ứng 3', 'Quyết toán', 'Thu phụ']

interface RevenueRow {
  id: string
  project_id: string
  stage: string
  amount: number
  collected_date?: string | null
  payment_method: string
  status: string
  note?: string | null
}

interface Project { id: string; name: string }

interface Props {
  entry: RevenueRow
  projects: Project[]
  onClose: () => void
}

export default function EditRevenueModal({ entry, projects, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [stage, setStage] = useState(entry.stage)

  const projectName = projects.find(p => p.id === entry.project_id)?.name ?? '—'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)

    const { error } = await supabase.from('revenue').update({
      stage: form.get('stage') as string,
      amount: parseInt(form.get('amount') as string || '0', 10),
      collected_date: form.get('collected_date') as string || null,
      payment_method: form.get('payment_method') as string,
      status: form.get('status') as string,
      note: form.get('note') as string || null,
    }).eq('id', entry.id)

    if (!error) {
      router.refresh()
      onClose()
    } else {
      alert('Lỗi khi cập nhật. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Xóa đợt "${entry.stage}"? Thao tác này không thể hoàn tác.`)) return
    setDeleting(true)

    const { error } = await supabase.from('revenue').delete().eq('id', entry.id)

    if (!error) {
      router.refresh()
      onClose()
    } else {
      alert('Lỗi khi xóa. Vui lòng thử lại.')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Chỉnh sửa đợt thu</h2>
            <p className="text-xs text-gray-400 mt-0.5">{projectName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Đợt thu <span className="text-red-500">*</span></label>
            <input
              name="stage"
              required
              value={stage}
              onChange={e => setStage(e.target.value)}
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
              defaultValue={entry.amount}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày thu</label>
              <input
                name="collected_date"
                type="date"
                defaultValue={entry.collected_date ?? ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái</label>
              <select
                name="status"
                defaultValue={entry.status}
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
                defaultValue={entry.payment_method}
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
                defaultValue={entry.note ?? ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
            >
              <Trash2 size={14} />
              {deleting ? 'Đang xóa...' : 'Xóa'}
            </button>
            <div className="flex items-center gap-3">
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
          </div>
        </form>
      </div>
    </div>
  )
}
