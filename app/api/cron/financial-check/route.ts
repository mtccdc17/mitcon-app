import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { runFinancialCheck, sendTelegramAlert } from '@/lib/financialAdvisor'

// Vercel Cron gọi endpoint này 1 lần/ngày (20h VN, xem vercel.json). Không có phiên đăng nhập
// người dùng nên dùng client admin (service-role) — giống pattern app/(ceo)/ceo/users/page.tsx.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const result = await runFinancialCheck(admin)
    const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.mitcondesign.vn'}/ceo/co-van-tai-chinh`
    const sent = await sendTelegramAlert(result, dashboardUrl)
    return NextResponse.json({ ok: true, riskLevel: result.riskLevel, telegramSent: sent })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
