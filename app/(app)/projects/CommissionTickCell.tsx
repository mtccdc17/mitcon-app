'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  projectId: string
  commissionHieu: boolean
  commissionTan: boolean
}

// Tick nhanh hoa hồng công trình ngay trên bảng danh sách — CHỈ CEO thấy (gọi từ page.tsx với role === 'ceo').
export default function CommissionTickCell({ projectId, commissionHieu, commissionTan }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [hieu, setHieu] = useState(commissionHieu)
  const [tan, setTan] = useState(commissionTan)

  async function toggle(field: 'commission_hieu' | 'commission_tan') {
    const cur = field === 'commission_hieu' ? hieu : tan
    const next = !cur
    if (field === 'commission_hieu') setHieu(next); else setTan(next)
    const { error } = await supabase.from('projects').update({ [field]: next }).eq('id', projectId)
    if (error) {
      if (field === 'commission_hieu') setHieu(cur); else setTan(cur)
    } else {
      router.refresh()
    }
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => toggle('commission_hieu')}
        title={hieu ? 'Đang tính hoa hồng Hiếu (1%) — bấm để tắt' : 'Bấm để tính hoa hồng Hiếu (1%)'}
        className={`w-6 h-6 rounded-full text-[10px] font-bold border flex items-center justify-center transition-colors ${
          hieu ? 'bg-amber-500 border-amber-500 text-white' : 'bg-gray-50 border-gray-300 text-gray-300 hover:border-amber-300'
        }`}
      >
        H
      </button>
      <button
        type="button"
        onClick={() => toggle('commission_tan')}
        title={tan ? 'Đang tính hoa hồng Tấn (0.5%) — bấm để tắt' : 'Bấm để tính hoa hồng Tấn (0.5%)'}
        className={`w-6 h-6 rounded-full text-[10px] font-bold border flex items-center justify-center transition-colors ${
          tan ? 'bg-amber-500 border-amber-500 text-white' : 'bg-gray-50 border-gray-300 text-gray-300 hover:border-amber-300'
        }`}
      >
        T
      </button>
    </div>
  )
}
