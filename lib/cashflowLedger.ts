import type { SupabaseClient } from '@supabase/supabase-js'
import { calcPayroll, attachSalaryChanges } from '@/app/(app)/payroll/calc'
import { fixedPayDate } from '@/lib/opexFixed'

export interface LedgerEntry {
  id: string
  date: string
  channel: 'tk_cty' | 'tk_cn' | 'tm'
  direction: 'in' | 'out'
  category: string
  description: string
  amount: number
}

const mapCh = (ch?: string | null): 'tk_cty' | 'tk_cn' | 'tm' | null => {
  if (ch === 'ocb' || ch === 'lp' || ch === 'mb' || ch === 'tk_cn') return 'tk_cn'
  if (ch === 'tk_cty') return 'tk_cty'
  if (ch === 'tm') return 'tm'
  return null
}
const noteChannel = (note?: string | null): 'tk_cty' | 'tk_cn' | 'tm' | null => {
  const n = (note ?? '').trim().toLowerCase()
  if (n === 'ck cty' || n === 'ck công ty') return 'tk_cty'
  if (n === 'ck cn' || n === 'ck cá nhân') return 'tk_cn'
  if (n === 'tm' || n === 'tiền mặt') return 'tm'
  return null
}

// Gom TOÀN BỘ lịch sử thu/chi ảnh hưởng 3 kênh dòng tiền (TK Công ty / TK Cá nhân / Tiền mặt),
// từ mọi nguồn mà computeCashflow() cộng/trừ — dùng để Sếp tự tra cứu thay vì phải nhờ viết SQL.
export async function fetchCashflowLedger(supabase: SupabaseClient): Promise<LedgerEntry[]> {
  const [
    { data: revenue },
    { data: projects },
    { data: deposits },
    { data: loans },
    { data: transfers },
    { data: transactions },
    { data: personalExpenses },
    { data: operatingCosts },
    { data: fixedPayments },
    { data: taxPayments },
    { data: siteAdvances },
    { data: employeesRaw },
    { data: payrollEntries },
    { data: salaryChanges },
    { data: payrollAdvances },
  ] = await Promise.all([
    supabase.from('revenue').select('id, amount, status, payment_channel, payment_method, collected_date, project_id'),
    supabase.from('projects').select('id, name'),
    supabase.from('channel_deposits').select('id, date, description, channel, amount'),
    supabase.from('personal_loans').select('id, date, description, channel, amount, repaid_amount, repaid_channel, repaid_date'),
    supabase.from('channel_transfers').select('id, from_channel, to_channel, amount, date, note'),
    supabase.from('transactions').select('id, description, amount, vat_amount, tncn_amount, is_labor, is_vat_allocation, contract_id, note, payment_status, payment_date, transaction_date, actual_paid, project_id'),
    supabase.from('personal_expenses').select('id, date, description, channel, amount'),
    supabase.from('operating_costs').select('id, spent_date, source_channel, description, amount'),
    supabase.from('fixed_cost_payments').select('id, paid_date, source_channel, item_name, amount'),
    supabase.from('tax_payments').select('id, paid_date, source_channel, kind, amount, note'),
    supabase.from('site_advances').select('id, date, channel, person, project, amount'),
    supabase.from('employees').select('*'),
    supabase.from('payroll_entries').select('*'),
    supabase.from('salary_changes').select('*'),
    supabase.from('payroll_advances').select('id, staff_id, advance_amount, advance_month, advance_year, source_channel, created_at'),
  ])
  const employees = attachSalaryChanges(employeesRaw ?? [], salaryChanges ?? [])

  const projectName = new Map((projects ?? []).map(p => [p.id, p.name]))
  const entries: LedgerEntry[] = []

  // 1) Doanh thu đã thu
  for (const r of (revenue ?? [])) {
    if (r.status !== 'collected' || !r.collected_date) continue
    const ch = r.payment_channel === 'tm' || (!r.payment_channel && r.payment_method === 'Tiền mặt')
      ? 'tm' : mapCh(r.payment_channel)
    if (!ch) continue
    entries.push({
      id: `rev-${r.id}`, date: r.collected_date, channel: ch, direction: 'in',
      category: 'Doanh thu', description: projectName.get(r.project_id ?? '') ?? 'Doanh thu', amount: r.amount ?? 0,
    })
  }

  // 2) Nộp ngược vào quỹ
  for (const d of (deposits ?? [])) {
    const ch = mapCh(d.channel)
    if (!ch) continue
    entries.push({ id: `dep-${d.id}`, date: d.date, channel: ch, direction: 'in', category: 'Nộp ngược quỹ', description: d.description, amount: d.amount ?? 0 })
  }

  // 2b) Mượn tiền cá nhân → công ty (lúc mượn = thu vào; lúc hoàn trả = chi ra)
  for (const l of (loans ?? [])) {
    const ch = mapCh(l.channel)
    if (ch) entries.push({ id: `loan-in-${l.id}`, date: l.date, channel: ch, direction: 'in', category: 'Mượn tiền Sếp', description: l.description, amount: l.amount ?? 0 })
    if ((l.repaid_amount ?? 0) > 0 && l.repaid_date) {
      const rch = mapCh(l.repaid_channel ?? l.channel)
      if (rch) entries.push({ id: `loan-out-${l.id}`, date: l.repaid_date, channel: rch, direction: 'out', category: 'Trả nợ Sếp', description: l.description, amount: l.repaid_amount ?? 0 })
    }
  }

  // 3) Chuyển tiền nội bộ — 1 dòng sinh 2 bút toán (đi 1 kênh, đến 1 kênh)
  for (const t of (transfers ?? [])) {
    const from = mapCh(t.from_channel), to = mapCh(t.to_channel)
    const label = t.note || 'Chuyển tiền nội bộ'
    if (from) entries.push({ id: `trf-out-${t.id}`, date: t.date, channel: from, direction: 'out', category: 'Chuyển đi', description: label, amount: t.amount ?? 0 })
    if (to) entries.push({ id: `trf-in-${t.id}`, date: t.date, channel: to, direction: 'in', category: 'Chuyển đến', description: label, amount: t.amount ?? 0 })
  }

  // 4) Giao dịch công trình (đã trả / trả một phần) — HĐ VAT luôn qua TK Công ty; HĐ không VAT theo note.
  // Loại giao dịch số ÂM (điều chuyển/khấu trừ chi phí giữa công trình) — không phải tiền mặt thật đổi.
  for (const t of (transactions ?? [])) {
    if (t.is_vat_allocation) continue
    if ((t.amount ?? 0) < 0) continue
    if (t.payment_status !== 'paid' && t.payment_status !== 'partial') continue
    const date = t.payment_date ?? t.transaction_date
    if (!date) continue
    const amount = t.payment_status === 'partial' ? (t.actual_paid ?? 0) : t.amount
    if (amount <= 0) continue
    const isVatTx = (t.vat_amount ?? 0) > 0 || (t.tncn_amount ?? 0) > 0
    // GS chi từ quỹ đã ứng → không phải dòng tiền công ty mới (đã tính lúc tạm ứng), kể cả khi khoản chi có VAT.
    const ch = t.note === 'Từ quỹ ứng' ? null : (isVatTx ? 'tk_cty' : noteChannel(t.note))
    if (!ch) continue
    entries.push({
      id: `tx-${t.id}`, date, channel: ch, direction: 'out',
      category: 'Giao dịch công trình', description: `${t.description}${projectName.get(t.project_id ?? '') ? ' — ' + projectName.get(t.project_id ?? '') : ''}`,
      amount,
    })
  }

  // 5) Chi tiêu cá nhân
  for (const e of (personalExpenses ?? [])) {
    const ch = mapCh(e.channel)
    if (!ch) continue
    entries.push({ id: `pe-${e.id}`, date: e.date, channel: ch, direction: 'out', category: 'Chi tiêu cá nhân', description: e.description, amount: e.amount ?? 0 })
  }

  // 6) Chi phí vận hành (ADS/khác)
  for (const c of (operatingCosts ?? [])) {
    const ch = mapCh(c.source_channel)
    if (!ch || !c.spent_date) continue
    entries.push({ id: `opex-${c.id}`, date: c.spent_date, channel: ch, direction: 'out', category: 'Chi phí vận hành', description: c.description, amount: c.amount ?? 0 })
  }

  // 7) Chi phí cố định
  for (const f of (fixedPayments ?? [])) {
    const ch = mapCh(f.source_channel)
    if (!ch || !f.paid_date) continue
    entries.push({ id: `fix-${f.id}`, date: f.paid_date, channel: ch, direction: 'out', category: 'Chi phí cố định', description: f.item_name, amount: f.amount ?? 0 })
  }

  // 8) Thuế BHXH/TNCN/VAT bù từng lần đóng — pass-through (không phải chi phí), chỉ ảnh hưởng dòng tiền
  const TAX_LABEL: Record<string, string> = { bhxh: 'BHXH', tncn: 'TNCN', vat: 'VAT bù' }
  const TAX_DEFAULT_DESC: Record<string, string> = { bhxh: 'Đóng BHXH', tncn: 'Nộp TNCN', vat: 'Nộp VAT bù' }
  for (const t of (taxPayments ?? [])) {
    const ch = mapCh(t.source_channel)
    if (!ch || !t.paid_date) continue
    entries.push({
      id: `tax-${t.id}`, date: t.paid_date, channel: ch, direction: 'out',
      category: TAX_LABEL[t.kind] ?? t.kind, description: t.note || TAX_DEFAULT_DESC[t.kind] || 'Nộp thuế', amount: t.amount ?? 0,
    })
  }

  // 9) Tạm ứng công trình (tiền ra khỏi kênh nguồn tại thời điểm ứng)
  for (const a of (siteAdvances ?? [])) {
    const ch = mapCh(a.channel)
    if (!ch || !a.date) continue
    entries.push({
      id: `adv-${a.id}`, date: a.date, channel: ch, direction: 'out',
      category: 'Tạm ứng công trình', description: `Ứng cho ${a.person}${a.project ? ' — ' + a.project : ''}`, amount: a.amount ?? 0,
    })
  }

  // 10) Ứng lương — tiền ra khỏi kênh nguồn NGAY tại ngày ứng (không đợi tới lúc chi lương cuối tháng).
  // Gom theo (nhân sự, tháng, năm) để TRỪ NGƯỢC khỏi lương thực chi cuối tháng, tránh đếm 2 lần.
  const empMap = new Map((employees ?? []).map(e => [e.id, e]))
  const advForEntry = new Map<string, { ck: number; tm: number }>()
  for (const a of (payrollAdvances ?? [])) {
    const emp = empMap.get(a.staff_id)
    const ch = mapCh(a.source_channel)
    const date = (a.created_at ?? '').slice(0, 10)
    if (ch && date) {
      entries.push({
        id: `padv-${a.id}`, date, channel: ch, direction: 'out',
        category: 'Ứng lương', description: `Ứng lương ${emp?.name ?? ''} — T${a.advance_month}/${a.advance_year}`, amount: a.advance_amount ?? 0,
      })
    }
    const key = `${a.staff_id}_${a.advance_month}_${a.advance_year}`
    const cur = advForEntry.get(key) ?? { ck: 0, tm: 0 }
    if ((a.source_channel ?? 'tm') === 'tk_cty') cur.ck += a.advance_amount ?? 0
    else cur.tm += a.advance_amount ?? 0
    advForEntry.set(key, cur)
  }

  // 11) Lương tự động — Thực nhận (1) → TK Công ty, Thực nhận (2) → TK Cá nhân, tại ngày chi thật (05 tháng sau).
  // Kế toán có thể nhập số liệu lương trước ngày chi thật — chỉ đưa vào lịch sử khi ngày đó đã qua.
  // Đã TRỪ phần đã ứng lương trước đó (mục 10) để không tính tiền rời quỹ 2 lần.
  const todayStr = new Date().toISOString().slice(0, 10)
  for (const en of (payrollEntries ?? [])) {
    const emp = empMap.get(en.employee_id)
    if (!emp) continue
    const date = fixedPayDate('nhan_su', en.month, en.year)
    if (date > todayStr) continue
    const r = calcPayroll(emp, en, en.month, en.year)
    const adv = advForEntry.get(`${en.employee_id}_${en.month}_${en.year}`) ?? { ck: 0, tm: 0 }
    const tn1 = r.thucNhan1 - adv.ck
    const tn2 = r.thucNhan2 - adv.tm
    if (tn1 > 0) entries.push({ id: `sal1-${en.id}`, date, channel: 'tk_cty', direction: 'out', category: 'Lương (TN1)', description: `${emp.name} — T${en.month}/${en.year}`, amount: tn1 })
    if (tn2 > 0) entries.push({ id: `sal2-${en.id}`, date, channel: 'tk_cn', direction: 'out', category: 'Lương (TN2)', description: `${emp.name} — T${en.month}/${en.year}`, amount: tn2 })
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date))
}
