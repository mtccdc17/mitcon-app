import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OpexClient from './OpexClient'
import { calcPayroll, attachSalaryChanges } from '@/app/(app)/payroll/calc'
import { computeCashflow } from '@/lib/cashflow'
import { fixedItemsForRange, ceoBhxhForRange } from '@/lib/opexFixed'

interface PageProps {
  searchParams: Promise<{ period?: string; month?: string; quarter?: string; year?: string }>
}

const pad = (n: number) => String(n).padStart(2, '0')

export default async function OpexPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, id').eq('id', user.id).single()
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  const params = await searchParams
  const now = new Date()
  const period = (params.period === 'quy' || params.period === 'nam') ? params.period : 'thang'
  const year  = parseInt(params.year ?? String(now.getFullYear()))
  const month = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1))))
  const quarter = Math.min(4, Math.max(1, parseInt(params.quarter ?? String(Math.ceil((now.getMonth() + 1) / 3)))))

  // ── Khoảng tháng theo bộ lọc ──
  const fromM = period === 'thang' ? month : period === 'quy' ? (quarter - 1) * 3 + 1 : 1
  let toM     = period === 'thang' ? month : period === 'quy' ? (quarter - 1) * 3 + 3 : 12
  // Không tính chi phí của tháng CHƯA TỚI (VD: xem Năm 2026 vào tháng 7 → chỉ tới tháng 7)
  if (year === now.getFullYear()) {
    if (period === 'nam') {
      // Mốc ngày 15 (CEO chốt 2026-08-06): xem "Năm" thì trước ngày 15 coi tháng hiện tại
      // là "chưa tới" (lương/BHXH/chi phí tháng này thường chưa chốt xong) → chỉ tính hết
      // tháng trước, để phản ánh đúng sức khỏe doanh nghiệp tại thời điểm hiện tại. Từ ngày
      // 15 trở đi mới cộng thêm cả tháng hiện tại.
      toM = Math.min(toM, now.getDate() >= 15 ? now.getMonth() + 1 : now.getMonth())
    } else {
      toM = Math.min(toM, now.getMonth() + 1)
    }
  }
  const fromDate = `${year}-${pad(fromM)}-01`
  const toDate   = `${year}-${pad(toM)}-${pad(new Date(year, toM, 0).getDate())}`
  const inRangeMonth = (m: number) => m >= fromM && m <= toM
  const inRangeDate = (d?: string | null) => d != null && d >= fromDate && d <= toDate

  // --- Core data ---
  const [
    { data: allEmployeesRaw },
    { data: rangeEntries },
    { data: allCosts },
    { data: contracts },
    { data: revenue },
    { data: transactions },
    { data: projects },
    { data: salaryChanges },
  ] = await Promise.all([
    supabase.from('employees').select('*').order('sort_order'),
    supabase.from('payroll_entries').select('*').eq('year', year),
    supabase.from('operating_costs').select('*').eq('year', year).order('month'),
    supabase.from('contracts').select('id, type'),
    supabase.from('revenue').select('amount, status, contract_id, project_id, collected_date'),
    supabase.from('transactions').select('amount, vat_amount, tncn_amount, is_labor, is_vat_allocation, contract_id, project_id, vat_dest_project_id, vat_dest_amount'),
    supabase.from('projects').select('id, name, status, end_date'),
    supabase.from('salary_changes').select('*'),
  ])
  const allEmployees = attachSalaryChanges(allEmployeesRaw ?? [], salaryChanges ?? [])

  // ══════════════════════════════════════════════════════════════════
  // GHI NHẬN DOANH THU THEO CÔNG TRÌNH NGHIỆM THU (VAS 15 — nguyên tắc phù hợp)
  // Chi phí công trình đang chạy = "dở dang", CHƯA trừ lợi nhuận.
  // Công trình nghiệm thu trong kỳ → gom TOÀN BỘ doanh thu + TOÀN BỘ giá vốn vào kỳ đó.
  // ══════════════════════════════════════════════════════════════════
  const completedIds = new Set((projects ?? [])
    .filter(p => p.status === 'completed' && inRangeDate(p.end_date))
    .map(p => p.id))
  const wipIds = new Set((projects ?? [])
    .filter(p => p.status !== 'completed')
    .map(p => p.id))
  const completedNames = (projects ?? [])
    .filter(p => completedIds.has(p.id))
    .map(p => ({ id: p.id as string, name: p.name as string, end_date: p.end_date as string }))

  const vatContractIds = new Set((contracts ?? []).filter(c => c.type === 'vat').map(c => c.id))
  const regularTx = (transactions ?? []).filter(t => !t.is_vat_allocation)

  // LƯU Ý: `amount` ĐÃ GỒM VAT (calcVAT tách VAT từ giá gross).
  //  - Vật tư HĐ VAT: VAT được hoàn → chi phí = amount − vat_amount
  //  - Vật tư HĐ không VAT: không hoàn được → chi phí = amount (KHÔNG cộng vat lần nữa)
  //  - Nhân công: chi phí = amount + tncn (công ty nộp TNCN thêm cho thầu phụ)
  const costOf = (t: { amount?: number; vat_amount?: number; tncn_amount?: number; is_labor?: boolean; contract_id?: string | null }) => {
    const amount = t.amount ?? 0, vat = t.vat_amount ?? 0, tncn = t.tncn_amount ?? 0
    const isVat = t.contract_id ? vatContractIds.has(t.contract_id) : false
    if (t.is_labor) return amount + tncn
    return isVat ? amount - vat : amount
  }

  // ── Giá vốn công trình nghiệm thu trong kỳ ──
  const cogsTx = regularTx.filter(t => t.project_id && completedIds.has(t.project_id))
  let chiPhiHdVat = 0, chiPhiHdKhongVat = 0
  for (const t of cogsTx) {
    const isVat = t.contract_id ? vatContractIds.has(t.contract_id) : false
    if (isVat) chiPhiHdVat += costOf(t)
    else       chiPhiHdKhongVat += costOf(t)
  }

  // ── Chi phí dở dang: công trình đang chạy (chỉ hiển thị, KHÔNG trừ lợi nhuận) ──
  const chiPhiDoDang = regularTx
    .filter(t => t.project_id && wipIds.has(t.project_id))
    .reduce((s, t) => s + costOf(t), 0)

  // ── Doanh thu công trình nghiệm thu trong kỳ (toàn bộ, kể cả chưa thu) ──
  const rangeRev = (revenue ?? []).filter(r => r.project_id && completedIds.has(r.project_id))
  const doanhThuTong = rangeRev.reduce((s, r) => s + (r.amount ?? 0), 0)
  const doanhThuDaThu = rangeRev.filter(r => r.status === 'collected').reduce((s, r) => s + (r.amount ?? 0), 0)
  const revVatGross = rangeRev.filter(r => r.contract_id && vatContractIds.has(r.contract_id)).reduce((s, r) => s + (r.amount ?? 0), 0)
  const doanhThuVatNet = Math.round(revVatGross / 1.08)
  const doanhThuKhongVat = doanhThuTong - revVatGross

  // Khoản chi ở CÔNG TRÌNH KHÁC có "Phân bổ" gắn trực tiếp (VT có VAT hoặc NC có TNCN), đích = công trình
  // nghiệm thu trong kỳ này. CHỈ cộng vào VAT đầu vào (xem vatDauVao bên dưới) — KHÔNG cộng vào chi phí hợp lệ
  // TNDN hay Lợi nhuận thực tế; CEO tự cân đối doanh thu VAT phù hợp dựa trên số phân bổ hiển thị ở trang công trình.
  const vatDestTx = (transactions ?? []).filter(t => t.vat_dest_project_id && completedIds.has(t.vat_dest_project_id))

  // ── Chi phí hợp lệ (cho TNDN) — công trình nghiệm thu trong kỳ ──
  const chiPhiVatTuHopLe = cogsTx.filter(t => !t.is_labor && (t.vat_amount ?? 0) > 0)
    .reduce((s, t) => s + (t.amount ?? 0) - (t.vat_amount ?? 0), 0)
  const chiPhiNhanCongHopLe = cogsTx.filter(t => t.is_labor && (t.tncn_amount ?? 0) > 0)
    .reduce((s, t) => s + (t.amount ?? 0) + (t.tncn_amount ?? 0), 0)

  // ── Nghĩa vụ thuế nộp nhà nước (CHỈ THEO DÕI — không cộng vào chi phí) ──
  // TNCN đã nằm trong giá vốn nhân công; VAT là thu hộ chi hộ, không phải chi phí.
  const tncnThauPhu = cogsTx.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)

  // ══════════════════════════════════════════════════════════════════
  // VAT phải nộp bù — 2 cách tính song song:
  //  (A) "Theo công trình nghiệm thu" (VAS 15) — cách cũ, dùng cho Q1/2026 trở về trước
  //      vì số đó đã chốt/đã nộp, không đổi lại.
  //  (B) "Theo ngày hóa đơn thực tế" (đúng nguyên tắc kê khai thuế GTGT — Thông tư 69/2025,
  //      khớp trang Kiểm Soát Hóa Đơn) — dùng từ Quý 2/2026 trở đi theo quyết định của CEO.
  // ══════════════════════════════════════════════════════════════════
  const vatDauRaCompletion = revVatGross - doanhThuVatNet
  const vatAllocTx = (transactions ?? []).filter(t => t.is_vat_allocation && t.project_id && completedIds.has(t.project_id))
  const vatDauVaoCompletion = cogsTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
    + vatAllocTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
    + vatDestTx.reduce((s, t) => s + (t.vat_dest_amount ?? 0), 0)
  const thueBuCompletion = Math.max(0, vatDauRaCompletion - vatDauVaoCompletion)

  const VAT_METHOD_CUTOVER_DATE = '2026-04-01' // Quý 2/2026
  const useInvoiceDateMethod = fromDate >= VAT_METHOD_CUTOVER_DATE

  const [{ data: vatOutputContracts }, { data: vatInputTx }] = useInvoiceDateMethod
    ? await Promise.all([
        supabase.from('contracts').select('id, value, invoice_issue_date').eq('type', 'vat').gt('value', 0),
        supabase.from('transactions').select('vat_amount, transaction_date, invoice_date, is_vat_allocation').gt('vat_amount', 0),
      ])
    : [{ data: null }, { data: null }]

  const vatDauRaInvoice = (vatOutputContracts ?? [])
    .filter(o => o.invoice_issue_date && inRangeDate(o.invoice_issue_date))
    .reduce((s, o) => s + (o.value - Math.round(o.value / 1.08)), 0)
  const vatDauVaoInvoice = (vatInputTx ?? [])
    .filter(t => !t.is_vat_allocation && inRangeDate(t.invoice_date ?? t.transaction_date))
    .reduce((s, t) => s + (t.vat_amount ?? 0), 0)
  const thueBuInvoice = Math.max(0, vatDauRaInvoice - vatDauVaoInvoice)

  const vatMethod: 'invoice' | 'completion' = useInvoiceDateMethod ? 'invoice' : 'completion'
  const vatDauRa = useInvoiceDateMethod ? vatDauRaInvoice : vatDauRaCompletion
  const vatDauVao = useInvoiceDateMethod ? vatDauVaoInvoice : vatDauVaoCompletion
  const thueBu = useInvoiceDateMethod ? thueBuInvoice : thueBuCompletion

  // ── Payroll trong kỳ ──
  const empMap = new Map((allEmployees ?? []).map(e => [e.id, e]))
  let payrollTN1 = 0, payrollTN2 = 0, payrollBhxhNLD = 0, payrollBhxhCTY = 0
  for (const e of (rangeEntries ?? [])) {
    if (!inRangeMonth(e.month)) continue
    const emp = empMap.get(e.employee_id)
    if (!emp) continue
    const r = calcPayroll(emp, e, e.month, year)
    payrollTN1     += r.thucNhan1
    payrollTN2     += r.thucNhan2
    payrollBhxhNLD += r.bhxhNLD
    payrollBhxhCTY += r.bhxhCTY
  }
  const ceoBhxh = ceoBhxhForRange(year, fromM, toM)
  const bhxhTotal = payrollBhxhNLD + payrollBhxhCTY + ceoBhxh

  // ── Chi phí cố định / nhân sự cố định trong kỳ ──
  const fixedItems = fixedItemsForRange(year, fromM, toM)
  const fixedCoDinh = fixedItems.filter(i => i.group === 'co_dinh')
  const fixedNhanSu = fixedItems.filter(i => i.group === 'nhan_su')
  const fixedCoDinhTotal = fixedCoDinh.reduce((s, i) => s + i.amount, 0)
  const fixedNhanSuTotal = fixedNhanSu.reduce((s, i) => s + i.amount, 0)

  // ── Chi phí phát sinh (operating_costs) trong kỳ ──
  const rangeCosts = (allCosts ?? []).filter(c => inRangeMonth(c.month))
  const designFreelance = rangeCosts.filter(c => c.cost_type === 'design_freelance')
  const adsCosts        = rangeCosts.filter(c => c.cost_type === 'ads')
  const otherCosts      = rangeCosts.filter(c => c.cost_type !== 'ads' && c.cost_type !== 'design_freelance')
  const sumC = (a: typeof rangeCosts) => a.reduce((s, c) => s + c.amount, 0)

  const nhanSuTotal = payrollTN1 + payrollTN2 + fixedNhanSuTotal + sumC(designFreelance)
  // Chi phí vận hành KHÔNG gồm nghĩa vụ thuế (tránh cộng trùng TNCN & VAT)
  const chiPhiVanHanh = fixedCoDinhTotal + nhanSuTotal + bhxhTotal + sumC(adsCosts) + sumC(otherCosts)

  // ══ Lợi nhuận kỳ = Lãi gộp công trình nghiệm thu − Chi phí vận hành ══
  const laiGop = doanhThuVatNet + doanhThuKhongVat - chiPhiHdVat - chiPhiHdKhongVat
  const loiNhuan = laiGop - chiPhiVanHanh
  const profitTable = {
    doanhThuVatNet, doanhThuKhongVat, chiPhiHdVat, chiPhiHdKhongVat,
    laiGop, chiPhiVanHanh, loiNhuan, chiPhiDoDang,
  }

  // ══ Cơ sở thuế TNDN ══
  const chiPhiVanHanhHopLe = payrollTN1 + sumC(rangeCosts.filter(c => c.is_deductible))
  const coSoThue = doanhThuVatNet - chiPhiVatTuHopLe - chiPhiNhanCongHopLe - chiPhiVanHanhHopLe - bhxhTotal
  const taxTable = {
    doanhThuVatNet, chiPhiVatTu: chiPhiVatTuHopLe, chiPhiNhanCong: chiPhiNhanCongHopLe,
    chiPhiVanHanh: chiPhiVanHanhHopLe, bhxh: bhxhTotal, coSo: coSoThue,
    tndn: Math.max(0, Math.round(coSoThue * 0.17)),
  }

  // ── Cashflow + panel giữ nguyên ──
  const cashflow = await computeCashflow(supabase)
  const [
    { data: chotSoSettings }, { data: transfers },
    { data: fixedPayments }, { data: taxPayments },
  ] = await Promise.all([
    supabase.from('cashflow_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('channel_transfers').select('*').order('date', { ascending: false }),
    supabase.from('fixed_cost_payments').select('*').eq('year', year),
    supabase.from('tax_payments').select('*').order('paid_date', { ascending: false }),
  ])
  // Lọc theo kỳ ghi nhận (for_month/for_year) chứ KHÔNG theo paid_date — một khoản có thể
  // nộp thật ở ngày khác kỳ nó thuộc về. Việc lọc theo for_month/for_year (kèm fallback paid_date
  // cho khoản cũ) đã nằm ở OpexClient.inTaxPeriod, nên ở đây chỉ cần truyền nguyên danh sách xuống.
  const rangeTaxPayments = taxPayments ?? []

  // ── Full backup data ──
  const [
    { data: allProjects }, { data: allContracts }, { data: allCategories },
    { data: allTransactions }, { data: allRevenue },
  ] = await Promise.all([
    supabase.from('projects').select('*'),
    supabase.from('contracts').select('*'),
    supabase.from('categories').select('*'),
    supabase.from('transactions').select('*'),
    supabase.from('revenue').select('*'),
  ])

  return (
    <OpexClient
      period={period}
      month={month}
      quarter={quarter}
      year={year}
      fromMonth={fromM}
      toMonth={toM}
      userId={user.id}
      doanhThuTong={doanhThuTong}
      doanhThuDaThu={doanhThuDaThu}
      chiPhiVanHanh={chiPhiVanHanh}
      completedProjects={completedNames}
      wipCount={wipIds.size}
      fixedCoDinh={fixedCoDinh}
      fixedNhanSu={fixedNhanSu}
      payrollTN1={payrollTN1}
      payrollTN2={payrollTN2}
      payrollBhxhNLD={payrollBhxhNLD}
      payrollBhxhCTY={payrollBhxhCTY}
      ceoBhxh={ceoBhxh}
      designFreelance={designFreelance}
      adsCosts={adsCosts}
      otherCosts={otherCosts}
      tncnThauPhu={tncnThauPhu}
      thueBu={thueBu}
      vatDauRa={vatDauRa}
      vatDauVao={vatDauVao}
      vatMethod={vatMethod}
      profitTable={profitTable}
      taxTable={taxTable}
      cashflow={cashflow}
      chotSo={chotSoSettings ?? null}
      transfers={transfers ?? []}
      fixedPayments={fixedPayments ?? []}
      taxPayments={rangeTaxPayments}
      backupData={{
        projects: allProjects ?? [],
        contracts: allContracts ?? [],
        categories: allCategories ?? [],
        transactions: allTransactions ?? [],
        revenue: allRevenue ?? [],
        operatingCosts: allCosts ?? [],
      }}
    />
  )
}
