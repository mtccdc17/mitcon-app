import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { computeTaxObligationSummary, type TaxObligationSummary } from '@/lib/taxCalc'
import { computeCashflow } from '@/lib/cashflow'

export type RiskLevel = 'an_toan' | 'canh_bao' | 'nguy_hiem'

export interface FinancialCheckResult {
  cashOnHand: number
  obligations: TaxObligationSummary
  buffer: number
  riskLevel: RiskLevel
  adviceText: string
}

export function classifyRisk(cashOnHand: number, tongConThieu: number, buffer: number): RiskLevel {
  if (buffer < 0) return 'nguy_hiem'
  // Chưa đủ 30% "đệm an toàn" trên phần còn thiếu — VD còn thiếu 100tr, quỹ dư chỉ hơn 100tr
  // chút ít (chưa tới 130tr) vẫn coi là cảnh báo vì gần như không có dư địa xoay sở.
  if (tongConThieu > 0 && buffer < tongConThieu * 0.3) return 'canh_bao'
  return 'an_toan'
}

async function generateAdvice(result: Omit<FinancialCheckResult, 'adviceText'>): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return 'Chưa cấu hình ANTHROPIC_API_KEY nên chưa thể tạo lời tư vấn tự động. Số liệu rủi ro phía trên vẫn chính xác — Sếp thêm biến môi trường này trên Vercel để bật tính năng tư vấn AI.'
  }
  const anthropic = new Anthropic({ apiKey })
  const { cashOnHand, obligations, buffer, riskLevel } = result
  const dataJson = JSON.stringify({
    tienMatHienCo: cashOnHand,
    ngheiaVuConThieu: obligations.items.map(i => ({ loai: i.label, phaiNop: i.phaiNop, daNop: i.daNop, conThieu: i.conThieu })),
    tongConThieu: obligations.tongConThieu,
    quyDuSauKhiTruNoThue: buffer,
    xepLoaiRuiRo: riskLevel,
  })
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 700,
    system: 'Bạn là chuyên gia tài chính doanh nghiệp SME ngành thi công xây dựng/nội thất tại Việt Nam, đang tư vấn trực tiếp cho CEO một công ty ~10 nhân sự, doanh thu ~10 tỷ/năm. CEO đang bị động vì kế toán thuế freelance báo cáo không đều, từng có lần 9 tháng không báo BHXH gây đứt gãy dòng tiền. Nhiệm vụ của bạn: đọc số liệu JSON (tiền mặt hiện có, nghĩa vụ VAT/TNCN thầu phụ/BHXH còn thiếu lũy kế, quỹ dư sau khi trừ nợ thuế, xếp loại rủi ro) và viết một đoạn tư vấn tiếng Việt ngắn gọn (150-250 chữ), giọng thẳng thắn, cụ thể, không sáo rỗng: (1) đánh giá rủi ro hiện tại bằng lời dễ hiểu, (2) khuyến nghị hành động cụ thể (VD trích bao nhiêu % mỗi lần thu tiền công trình vào quỹ dự phòng thuế trước khi chi tiêu khoản khác), (3) nếu rủi ro cao, nhắc rõ khoản nào cần ưu tiên xử lý trước. Không lặp lại nguyên số liệu JSON, hãy diễn giải.',
    messages: [{ role: 'user', content: dataJson }],
  })
  const text = message.content.find(b => b.type === 'text')
  return text && text.type === 'text' ? text.text : 'Không nhận được phản hồi từ AI, thử lại sau.'
}

// Chạy 1 lượt kiểm tra đầy đủ: tính nghĩa vụ lũy kế + tiền mặt hiện có, xếp loại rủi ro, nhờ AI
// viết tư vấn, lưu 1 dòng log (vừa cache vừa tạo lịch sử xu hướng). Dùng chung cho cron job và
// nút "Làm mới đánh giá" thủ công trên dashboard.
export async function runFinancialCheck(supabase: SupabaseClient): Promise<FinancialCheckResult> {
  const [obligations, cashflow] = await Promise.all([
    computeTaxObligationSummary(supabase),
    computeCashflow(supabase),
  ])
  const cashOnHand = cashflow.tk_cty.net + cashflow.tk_cn.net + cashflow.tm.net
  const buffer = cashOnHand - obligations.tongConThieu
  const riskLevel = classifyRisk(cashOnHand, obligations.tongConThieu, buffer)

  const partial = { cashOnHand, obligations, buffer, riskLevel }
  const adviceText = await generateAdvice(partial)
  const result: FinancialCheckResult = { ...partial, adviceText }

  const vatItem = obligations.items.find(i => i.kind === 'vat')!
  const tncnItem = obligations.items.find(i => i.kind === 'tncn')!
  const bhxhItem = obligations.items.find(i => i.kind === 'bhxh')!
  await supabase.from('financial_advice_log').insert({
    cash_on_hand: cashOnHand,
    vat_phai_nop: vatItem.phaiNop, vat_da_nop: vatItem.daNop, vat_con_thieu: vatItem.conThieu,
    tncn_phai_nop: tncnItem.phaiNop, tncn_da_nop: tncnItem.daNop, tncn_con_thieu: tncnItem.conThieu,
    bhxh_phai_nop: bhxhItem.phaiNop, bhxh_da_nop: bhxhItem.daNop, bhxh_con_thieu: bhxhItem.conThieu,
    total_owed: obligations.tongConThieu,
    buffer,
    risk_level: riskLevel,
    advice_text: adviceText,
  })

  return result
}

export async function sendTelegramAlert(result: FinancialCheckResult, dashboardUrl: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false

  const emoji = result.riskLevel === 'nguy_hiem' ? '🔴' : result.riskLevel === 'canh_bao' ? '🟡' : '🟢'
  const label = result.riskLevel === 'nguy_hiem' ? 'NGUY HIỂM' : result.riskLevel === 'canh_bao' ? 'CẢNH BÁO' : 'AN TOÀN'
  const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ'
  const lines = [
    `${emoji} <b>Cố vấn tài chính Mitcon — ${label}</b>`,
    '',
    `Tiền mặt hiện có: <b>${fmt(result.cashOnHand)}</b>`,
    `Nghĩa vụ thuế+BHXH còn thiếu lũy kế: <b>${fmt(result.obligations.tongConThieu)}</b>`,
    ...result.obligations.items.map(i => `  · ${i.label}: còn thiếu ${fmt(i.conThieu)}`),
    `Quỹ dư sau khi trừ nợ thuế: <b>${fmt(result.buffer)}</b>`,
    '',
    result.adviceText,
    '',
    `Xem chi tiết: ${dashboardUrl}`,
  ]

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
  })
  return res.ok
}
