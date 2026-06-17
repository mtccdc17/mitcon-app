'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'

const DEFAULT_CATEGORIES = [
  'Thạch cao', 'Điện', 'Sơn nước', 'Nội thất', 'Sàn gỗ',
  'Cửa kính', 'Hệ thống nước', 'Điều hòa', 'Phòng cháy chữa cháy',
]

interface Props {
  projectId: string
  onClose: () => void
}

export default function AddCategoryModal({ projectId, onClose }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    const { error } = await supabase.from('categories').insert({
      project_id: projectId,
      name: name.trim(),
    })

    if (!error) onClose()
    else { alert('Lỗi khi lưu.'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Thêm hạng mục</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tên hạng mục</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="VD: Thạch cao"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Chọn nhanh:</p>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setName(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    name === cat
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={loading || !name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : 'Thêm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
