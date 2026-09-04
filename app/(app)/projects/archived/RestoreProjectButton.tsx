'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArchiveRestore } from 'lucide-react'

interface Props {
  projectId: string
  projectName: string
}

// Đưa 1 công trình ra khỏi lưu trữ — chuyển lại trạng thái "Đã hoàn thành", xoá dấu lưu trữ.
// CHỈ CEO thấy nút này (trang archived chỉ render khi role === 'ceo').
export default function RestoreProjectButton({ projectId, projectName }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState(false)

  async function restore() {
    if (!confirm(`Đưa công trình "${projectName}" ra khỏi lưu trữ?\nCông trình sẽ quay lại danh sách với trạng thái "Đã hoàn thành".`)) return
    setBusy(true)
    const { error } = await supabase
      .from('projects')
      .update({ status: 'completed', archived_at: null, archived_by: null })
      .eq('id', projectId)
    setBusy(false)
    if (error) {
      alert('Không đưa ra được: ' + error.message)
      return
    }
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={restore}
      disabled={busy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 shrink-0"
    >
      <ArchiveRestore size={14} />
      {busy ? '...' : 'Đưa ra ngoài'}
    </button>
  )
}
