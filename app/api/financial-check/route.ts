import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { NextResponse } from 'next/server'
import { runFinancialCheck } from '@/lib/financialAdvisor'

// Nút "Làm mới đánh giá" ở /ceo/co-van-tai-chinh — chạy lại toàn bộ (tính lũy kế mới + gọi AI
// viết tư vấn mới), luôn bỏ qua cache 24h (khác cron, người bấm biết mình đang tốn 1 lượt gọi AI).
export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfile(user.id)
  if (!profile || profile.role !== 'ceo') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  try {
    const result = await runFinancialCheck(supabase)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
