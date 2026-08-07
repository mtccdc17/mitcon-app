import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { runFinancialCheck, classifyRisk, type FinancialCheckResult } from '@/lib/financialAdvisor'
import { computeCashflow } from '@/lib/cashflow'
import AdvisorClient from './AdvisorClient'

export default async function FinancialAdvisorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  const { data: latest } = await supabase
    .from('financial_advice_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const isStale = !latest || (Date.now() - new Date(latest.created_at).getTime()) > 24 * 60 * 60 * 1000

  let result: FinancialCheckResult
  let generatedAt: string
  let cashflow

  if (isStale) {
    // Chạy đủ 1 lượt (tính lũy kế mới + gọi AI viết tư vấn mới) — computeCashflow bên trong
    // runFinancialCheck cũng dùng luôn cho hiển thị, khỏi query 2 lần.
    ;[result, cashflow] = await Promise.all([runFinancialCheck(supabase), computeCashflow(supabase)])
    generatedAt = new Date().toISOString()
  } else {
    // Nghĩa vụ lũy kế + lời tư vấn AI dùng lại bản đã lưu (đỡ tốn phí gọi AI mỗi lần vào trang),
    // NHƯNG tiền mặt hiện có + rủi ro luôn tính LẠI SỐNG — số dư tài khoản đổi liên tục, không
    // nên hiển thị số cũ dù advice text chưa cần làm mới ngay.
    cashflow = await computeCashflow(supabase)
    const cashOnHand = cashflow.tk_cty.net + cashflow.tk_cn.net + cashflow.tm.net
    const obligations = {
      items: [
        { kind: 'vat' as const, label: 'VAT phải nộp bù', phaiNop: latest.vat_phai_nop, daNop: latest.vat_da_nop, conThieu: latest.vat_con_thieu },
        { kind: 'tncn' as const, label: 'TNCN thầu phụ', phaiNop: latest.tncn_phai_nop, daNop: latest.tncn_da_nop, conThieu: latest.tncn_con_thieu },
        { kind: 'bhxh' as const, label: 'BHXH', phaiNop: latest.bhxh_phai_nop, daNop: latest.bhxh_da_nop, conThieu: latest.bhxh_con_thieu },
      ],
      tongConThieu: latest.total_owed,
    }
    const buffer = cashOnHand - obligations.tongConThieu
    result = {
      cashOnHand,
      obligations,
      buffer,
      riskLevel: classifyRisk(cashOnHand, obligations.tongConThieu, buffer),
      adviceText: latest.advice_text,
    }
    generatedAt = latest.created_at
  }

  return <AdvisorClient result={result} cashflow={cashflow} generatedAt={generatedAt} />
}
