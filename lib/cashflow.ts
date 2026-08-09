import type { SupabaseClient } from '@supabase/supabase-js'
import type { CashflowData } from '@/components/CashflowBox'
import { calcPayroll, attachSalaryChanges } from '@/app/(app)/payroll/calc'

// Tính dòng tiền thực tế theo 3 kênh (TK Công ty / TK Cá nhân / Tiền mặt).
// Có hỗ trợ "chốt sổ": số dư đầu kỳ + ngày chốt.
//   - Giao dịch ĐÃ settle (thu/trả) TRƯỚC ngày chốt → bỏ qua (đã nằm trong số dư đầu kỳ)
//   - Giao dịch CHƯA trả → luôn tính (nợ phải trả, chưa đụng tiền thật)
//   - Giao dịch sau ngày chốt → tính bình thường
//
// asOfDate (tùy chọn): tính số dư TÍNH ĐẾN HẾT 1 ngày quá khứ thay vì hiện tại — chỉ đếm các
// khoản có ngày settle thật (thu/trả/lương/thuế...) <= asOfDate. LƯU Ý: các khoản "nợ chưa trả"/
// "tạm ứng còn giữ" dùng payment_status/returned HIỆN TẠI trong DB (không có lịch sử trạng thái
// theo thời gian) nên chỉ mang tính tham khảo khi tra cứu ngày quá khứ, không tuyệt đối chính xác.
export async function computeCashflow(supabase: SupabaseClient, asOfDate?: string): Promise<CashflowData> {
  // Chốt sổ (bảng có thể chưa tồn tại → mặc định không chốt)
  let opening = { tk_cty: 0, tk_cn: 0, tm: 0 }
  let closing: string | null = null
  const { data: settings } = await supabase.from('cashflow_settings').select('*').eq('id', 1).maybeSingle()
  if (settings) {
    opening = {
      tk_cty: settings.opening_tk_cty ?? 0,
      tk_cn:  settings.opening_tk_cn ?? 0,
      tm:     settings.opening_tm ?? 0,
    }
    closing = settings.closing_date ?? null
  }

  // asOfDate: chỉ tính khoản có ngày settle <= asOfDate — dùng để tra "số dư tại 1 ngày quá khứ".
  const upTo = (d?: string | null) => !asOfDate || (d != null && d <= asOfDate)

  const [{ data: revenue }, { data: vatTx }, { data: noVatTx }] = await Promise.all([
    supabase.from('revenue').select('amount, status, payment_channel, payment_method, collected_date'),
    supabase
      .from('transactions')
      .select('amount, vat_amount, tncn_amount, note, payment_status, transaction_date, payment_date, actual_paid')
      .neq('is_vat_allocation', true)
      .or('vat_amount.gt.0,tncn_amount.gt.0'),
    supabase
      .from('transactions')
      .select('amount, note, payment_status, transaction_date, payment_date, actual_paid')
      .neq('is_vat_allocation', true)
      .eq('vat_amount', 0)
      .eq('tncn_amount', 0),
  ])

  // Thu: đã thu, và (không chốt sổ HOẶC thu sau ngày chốt), và <= asOfDate nếu có
  const keepRev = (r: { collected_date?: string | null }) =>
    (!closing || (r.collected_date != null && r.collected_date >= closing)) && upTo(r.collected_date)
  const collected = (revenue ?? []).filter(r => r.status === 'collected' && keepRev(r))

  const inTkCty = collected.filter(r => r.payment_channel === 'tk_cty').reduce((s, r) => s + r.amount, 0)
  const inTkCn  = collected.filter(r => r.payment_channel === 'tk_cn').reduce((s, r) => s + r.amount, 0)
  const inTm    = collected
    .filter(r => r.payment_channel === 'tm' || (!r.payment_channel && r.payment_method === 'Tiền mặt'))
    .reduce((s, r) => s + r.amount, 0)

  // Ngày tiền THẬT rời kênh = ngày thanh toán (payment_date); khoản cũ chưa có thì fallback ngày ghi.
  // Quan trọng: khoản chi ghi TRƯỚC chốt sổ nhưng TRẢ SAU chốt sổ vẫn phải trừ vào số dư.
  type TxLite = {
    payment_status?: string | null
    transaction_date?: string | null
    payment_date?: string | null
    actual_paid?: number | null
  }
  const settleDate = (t: TxLite) => t.payment_date ?? t.transaction_date
  const settledAfter = (t: TxLite) => {
    const d = settleDate(t)
    return (!closing || (d != null && d >= closing)) && upTo(d)
  }
  // Chi (đã trả): chỉ đếm khoản ĐÃ thanh toán, và (không chốt sổ HOẶC trả sau ngày chốt)
  const paidAfter = (t: TxLite) => t.payment_status === 'paid' && settledAfter(t)
  // TT một phần: phần actual_paid đã rời kênh (trả sau ngày chốt)
  const partialAfter = (t: TxLite) => t.payment_status === 'partial' && settledAfter(t)
  const partialPaid = (t: TxLite) => t.actual_paid ?? 0
  // Nợ chưa trả: chỉ để báo biết, KHÔNG trừ vào số dư (partial: chỉ báo phần còn thiếu)
  const isUnpaid = (t: TxLite) => t.payment_status !== 'paid'
  const unpaidPart = (t: TxLite, gross: number) =>
    gross - (t.payment_status === 'partial' ? (t.actual_paid ?? 0) : 0)

  // Loại giao dịch số ÂM (điều chuyển/khấu trừ chi phí giữa công trình) khỏi dòng tiền —
  // không phải tiền mặt thật đổi. Vẫn giữ trong chi phí công trình (P&L/thuế tính riêng).
  const vatTxC = (vatTx ?? []).filter(t => (t.amount ?? 0) >= 0)
  const noVatTxC = (noVatTx ?? []).filter(t => (t.amount ?? 0) >= 0)

  const isNoteCty = (t: { note?: string | null }) => t.note === 'CK CTY' || t.note === 'CK công ty'
  const isNoteCn  = (t: { note?: string | null }) => t.note === 'CK CN' || t.note === 'CK cá nhân'
  const isNoteTm  = (t: { note?: string | null }) => t.note === 'TM' || t.note === 'Tiền mặt'
  // GS chi từ quỹ đã ứng → tiền đã rời công ty lúc tạm ứng rồi (trừ qua advOut), KHÔNG được trừ TK Công ty lần nữa
  // dù khoản chi đó có VAT hay không — trước đây chỉ loại được ở nhánh không-VAT, còn VAT vẫn bị cộng cứng vào TK Công ty.
  const isFromAdvance = (t: { note?: string | null }) => t.note === 'Từ quỹ ứng'
  const vatTxCty = vatTxC.filter(t => !isFromAdvance(t))

  // LƯU Ý: amount ĐÃ gồm VAT (calcVAT tách VAT từ giá gross) → tiền chi ra = amount, KHÔNG cộng vat_amount nữa.
  const outTkCty =
    vatTxCty.filter(paidAfter).reduce((s, t) => s + t.amount, 0) +
    vatTxCty.filter(partialAfter).reduce((s, t) => s + partialPaid(t), 0) +
    noVatTxC.filter(t => isNoteCty(t) && paidAfter(t)).reduce((s, t) => s + t.amount, 0) +
    noVatTxC.filter(t => isNoteCty(t) && partialAfter(t)).reduce((s, t) => s + partialPaid(t), 0)
  const outTkCn =
    noVatTxC.filter(t => isNoteCn(t) && paidAfter(t)).reduce((s, t) => s + t.amount, 0) +
    noVatTxC.filter(t => isNoteCn(t) && partialAfter(t)).reduce((s, t) => s + partialPaid(t), 0)
  const outTm =
    noVatTxC.filter(t => isNoteTm(t) && paidAfter(t)).reduce((s, t) => s + t.amount, 0) +
    noVatTxC.filter(t => isNoteTm(t) && partialAfter(t)).reduce((s, t) => s + partialPaid(t), 0)

  const unpaidTkCty =
    vatTxCty.filter(isUnpaid).reduce((s, t) => s + unpaidPart(t, t.amount), 0) +
    noVatTxC.filter(t => isNoteCty(t) && isUnpaid(t)).reduce((s, t) => s + unpaidPart(t, t.amount), 0)
  const unpaidTkCn = noVatTxC.filter(t => isNoteCn(t) && isUnpaid(t)).reduce((s, t) => s + unpaidPart(t, t.amount), 0)
  const unpaidTm = noVatTxC.filter(t => isNoteTm(t) && isUnpaid(t)).reduce((s, t) => s + unpaidPart(t, t.amount), 0)

  // Bước 2: chi tiêu cá nhân trừ vào số dư kênh
  const { data: pExp } = await supabase.from('personal_expenses').select('channel, amount, date')
  // Nộp ngược tiền cá nhân vào quỹ công ty → CỘNG vào "Thu vào" của kênh (không phải doanh thu)
  const { data: deposits } = await supabase.from('channel_deposits').select('channel, amount, date')
  // Sếp mượn tiền cá nhân cho công ty → CỘNG vào kênh nhận lúc mượn, TRỪ vào kênh trả lúc hoàn trả
  const { data: loans } = await supabase.from('personal_loans').select('channel, amount, date, repaid_amount, repaid_channel, repaid_date')
  // Bước 3: chuyển tiền nội bộ giữa các kênh
  const { data: transfers } = await supabase.from('channel_transfers').select('from_channel, to_channel, amount, date')
  // Bước 4: tạm ứng công trình — tiền RA khỏi kênh nguồn (còn giữ = amount − returned)
  const { data: advances } = await supabase.from('site_advances').select('channel, amount, returned, date')
  // Bước 5: chi phí vận hành (opex) có chọn nguồn tiền → trừ vào kênh đó (chỉ khoản có source_channel)
  const { data: opexCosts } = await supabase.from('operating_costs').select('source_channel, amount, spent_date')
  // Bước 6: chi phí cố định đã chi (tick từng khoản)
  const { data: fixedPays } = await supabase.from('fixed_cost_payments').select('amount, source_channel, paid_date')
  // Bước 7: lương — TỰ ĐỘNG trừ (không cần tick): TN1 → TK Công ty, TN2 → TK Cá nhân
  const [{ data: employeesRaw }, { data: payrollEntries }, { data: taxPays }, { data: salaryChanges }, { data: payrollAdvances }] = await Promise.all([
    supabase.from('employees').select('*'),
    supabase.from('payroll_entries').select('*'),
    // Bước 8: từng lần đóng BHXH / TNCN thầu phụ
    supabase.from('tax_payments').select('amount, source_channel, paid_date'),
    supabase.from('salary_changes').select('*'),
    // Bước 9: ứng lương — tiền rời quỹ NGAY lúc ứng (không đợi tới lúc chi lương cuối tháng)
    supabase.from('payroll_advances').select('staff_id, advance_amount, advance_month, advance_year, source_channel, created_at'),
  ])
  const employees = attachSalaryChanges(employeesRaw ?? [], salaryChanges ?? [])

  const keepDate = (d?: string | null) => (!closing || (d != null && d >= closing)) && upTo(d)
  // OCB / LPBank / MB đều là TK cá nhân → gộp vào tk_cn cho dòng tiền
  const mapCh = (ch?: string | null) => (ch === 'ocb' || ch === 'lp' || ch === 'mb') ? 'tk_cn' : (ch ?? '')

  const peOut: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const e of (pExp ?? [])) {
    if (!keepDate(e.date)) continue
    // OCB / LPBank / MB đều là TK cá nhân → gộp vào tk_cn cho dòng tiền
    const ch = (e.channel === 'ocb' || e.channel === 'lp' || e.channel === 'mb') ? 'tk_cn' : e.channel
    if (ch in peOut) peOut[ch] += e.amount ?? 0
  }

  const trf: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const t of (transfers ?? [])) {
    if (!keepDate(t.date)) continue
    if (t.from_channel in trf) trf[t.from_channel] -= t.amount ?? 0
    if (t.to_channel in trf)   trf[t.to_channel]   += t.amount ?? 0
  }

  // Tạm ứng đang giữ = amount − returned (tiền còn ngoài công ty), trừ vào kênh nguồn
  const advOut: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const a of (advances ?? [])) {
    if (!keepDate(a.date)) continue
    const ch = (a.channel === 'ocb' || a.channel === 'lp' || a.channel === 'mb') ? 'tk_cn' : a.channel
    if (ch in advOut) advOut[ch] += (a.amount ?? 0) - (a.returned ?? 0)
  }

  // Opex có nguồn tiền → trừ vào kênh. Bỏ qua khoản không chọn nguồn (source_channel null).
  const opexOut: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const o of (opexCosts ?? [])) {
    if (!o.source_channel) continue
    if (!keepDate(o.spent_date)) continue
    const ch = mapCh(o.source_channel)
    if (ch in opexOut) opexOut[ch] += o.amount ?? 0
  }

  // Chi phí cố định đã chi → trừ vào kênh nguồn
  const fixOut: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const f of (fixedPays ?? [])) {
    if (!keepDate(f.paid_date)) continue
    const ch = mapCh(f.source_channel)
    if (ch in fixOut) fixOut[ch] += f.amount ?? 0
  }

  // Lương tự động vào dòng tiền: TN1 → TK Công ty, TN2 → TK Cá nhân.
  // Lịch chi thật (CEO chốt): lương tháng M được chi ngày 05 của tháng M+1 → dùng ngày này so với chốt sổ.
  const salaryPayDate = (m: number, y: number) => {
    const pm = m === 12 ? 1 : m + 1
    const py = m === 12 ? y + 1 : y
    return `${py}-${String(pm).padStart(2, '0')}-05`
  }
  // Kế toán có thể nhập số liệu lương tháng này TRƯỚC ngày chi thật (05 tháng sau) — nếu ngày chi
  // thật vẫn còn ở TƯƠNG LAI so với hôm nay thì chưa tính là đã chi, dù đã qua ngày chốt sổ.
  const todayStr = asOfDate ?? new Date().toISOString().slice(0, 10)
  const empById = new Map((employees ?? []).map(e => [e.id, e]))

  // Ứng lương: (a) trừ NGAY vào kênh nguồn thật tại ngày ứng (created_at), (b) gom theo
  // (nhân sự, tháng, năm) để TRỪ NGƯỢC khỏi lương thực chi cuối tháng — tránh đếm 2 lần.
  // Quy tắc CEO chốt: ứng từ TK CTY trừ Thực nhận (1), ứng TM/TK CN trừ Thực nhận (2).
  const advSalaryOut: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  const advForEntry = new Map<string, { ck: number; tm: number }>()
  for (const a of (payrollAdvances ?? [])) {
    const d = (a.created_at ?? '').slice(0, 10)
    const ch = mapCh(a.source_channel ?? 'tm')
    if (keepDate(d) && ch in advSalaryOut) advSalaryOut[ch] += a.advance_amount ?? 0

    const key = `${a.staff_id}_${a.advance_month}_${a.advance_year}`
    const cur = advForEntry.get(key) ?? { ck: 0, tm: 0 }
    if ((a.source_channel ?? 'tm') === 'tk_cty') cur.ck += a.advance_amount ?? 0
    else cur.tm += a.advance_amount ?? 0
    advForEntry.set(key, cur)
  }

  const payOut: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const e of (payrollEntries ?? [])) {
    const emp = empById.get(e.employee_id)
    if (!emp) continue
    const payDate = salaryPayDate(e.month, e.year)
    if (payDate > todayStr) continue
    if (!keepDate(payDate)) continue
    const r = calcPayroll(emp, e, e.month, e.year)
    const adv = advForEntry.get(`${e.employee_id}_${e.month}_${e.year}`) ?? { ck: 0, tm: 0 }
    payOut.tk_cty += r.thucNhan1 - adv.ck
    payOut.tk_cn  += r.thucNhan2 - adv.tm
  }

  // Từng lần đóng BHXH / TNCN → trừ vào kênh nguồn
  const taxOut: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const t of (taxPays ?? [])) {
    if (!keepDate(t.paid_date)) continue
    const ch = mapCh(t.source_channel)
    if (ch in taxOut) taxOut[ch] += t.amount ?? 0
  }

  // Nộp ngược tiền cá nhân vào quỹ → cộng vào "Thu vào" của kênh nhận
  const depIn: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const d of (deposits ?? [])) {
    if (!keepDate(d.date)) continue
    const ch = mapCh(d.channel)
    if (ch in depIn) depIn[ch] += d.amount ?? 0
  }

  // Mượn tiền cá nhân → công ty: lúc mượn cộng vào kênh nhận, lúc hoàn trả trừ khỏi kênh trả
  const loanIn: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  const loanOut: Record<string, number> = { tk_cty: 0, tk_cn: 0, tm: 0 }
  for (const l of (loans ?? [])) {
    if (keepDate(l.date)) {
      const ch = mapCh(l.channel)
      if (ch in loanIn) loanIn[ch] += l.amount ?? 0
    }
    if ((l.repaid_amount ?? 0) > 0 && keepDate(l.repaid_date)) {
      const ch = mapCh(l.repaid_channel ?? l.channel)
      if (ch in loanOut) loanOut[ch] += l.repaid_amount ?? 0
    }
  }

  const iTkCty = inTkCty + depIn.tk_cty + loanIn.tk_cty
  const iTkCn  = inTkCn + depIn.tk_cn + loanIn.tk_cn
  const iTm    = inTm + depIn.tm + loanIn.tm

  const oTkCty = outTkCty + peOut.tk_cty + opexOut.tk_cty + fixOut.tk_cty + payOut.tk_cty + taxOut.tk_cty + advSalaryOut.tk_cty + loanOut.tk_cty
  const oTkCn  = outTkCn + peOut.tk_cn + opexOut.tk_cn + fixOut.tk_cn + payOut.tk_cn + taxOut.tk_cn + advSalaryOut.tk_cn + loanOut.tk_cn
  const oTm    = outTm + peOut.tm + opexOut.tm + fixOut.tm + payOut.tm + taxOut.tm + advSalaryOut.tm + loanOut.tm

  return {
    tk_cty: { opening: opening.tk_cty, in: iTkCty, out: oTkCty, unpaid: unpaidTkCty, advance: advOut.tk_cty, transfer: trf.tk_cty, net: opening.tk_cty + iTkCty - oTkCty - advOut.tk_cty + trf.tk_cty },
    tk_cn:  { opening: opening.tk_cn,  in: iTkCn,  out: oTkCn,  unpaid: unpaidTkCn,  advance: advOut.tk_cn,  transfer: trf.tk_cn,  net: opening.tk_cn + iTkCn - oTkCn - advOut.tk_cn + trf.tk_cn },
    tm:     { opening: opening.tm,     in: iTm,    out: oTm,    unpaid: unpaidTm,    advance: advOut.tm,     transfer: trf.tm,     net: opening.tm + iTm - oTm - advOut.tm + trf.tm },
  }
}
