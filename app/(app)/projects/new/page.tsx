'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewProjectPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = new FormData(e.currentTarget)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: project, error: err } = await supabase.from('projects').insert({
      name: form.get('name') as string,
      customer_name: form.get('customer_name') as string,
      address: form.get('address') as string || null,
      start_date: form.get('start_date') as string || null,
      end_date: form.get('end_date') as string || null,
      phase: form.get('phase') as string || 'Thi Công',
      created_by: user?.id,
    }).select().single()

    if (err || !project) {
      setError('Không thể tạo công trình. Vui lòng thử lại.')
      setLoading(false)
      return
    }

    // Create 2 default contracts
    await supabase.from('contracts').insert([
      { project_id: project.id, type: 'vat', value: 0, description: 'Hợp đồng xuất hóa đơn VAT' },
      { project_id: project.id, type: 'no_vat', value: 0, description: 'Hợp đồng không xuất hóa đơn' },
    ])

    router.push(`/projects/${project.id}`)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Tạo công trình mới</h1>
        <p className="text-sm text-gray-500 mt-0.5">Điền thông tin cơ bản về công trình</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên công trình <span className="text-red-500">*</span></label>
          <input name="name" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="VD: VP Công ty ABC - Q1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên khách hàng <span className="text-red-500">*</span></label>
          <input name="customer_name" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="VD: Công ty TNHH ABC" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ công trình</label>
          <input name="address" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Số nhà, đường, quận, thành phố" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Giai đoạn <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input type="radio" name="phase" value="Thi Công" defaultChecked className="accent-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">🏗 Thi Công</p>
                <p className="text-xs text-gray-500">Xây dựng &amp; hoàn thiện</p>
              </div>
            </label>
            <label className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
              <input type="radio" name="phase" value="Thiết Kế" className="accent-purple-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">✏️ Thiết Kế</p>
                <p className="text-xs text-gray-500">Bản vẽ &amp; hồ sơ</p>
              </div>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
            <input name="start_date" type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc dự kiến</label>
            <input name="end_date" type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Hủy
          </button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
            {loading ? 'Đang tạo...' : 'Tạo công trình'}
          </button>
        </div>
      </form>
    </div>
  )
}
