import type { SupabaseClient } from '@supabase/supabase-js'
import { calcPayroll, attachSalaryChanges } from '@/app/(app)/payroll/calc'
import { ceoBhxhForRange } from '@/lib/opexFixed'

// ══════════════════════════════════════════════════════════════════
// Nghĩa vụ VAT / TNCN thầu phụ / BHXH LŨY KẾ (từ toàn bộ dữ liệu hiện có
// trong app, không giới hạn theo 1 kỳ) — dùng cho tính năng "Cố vấn tài
// chính AI". Công thức MÔ PHỎNG LẠI đúng logic đang chạy ở trang Vận hành
// (app/(ceo)/ceo/opex/page.tsx) nhưng KHÔNG import/sửa file đó — trang Vận
// hành đã qua rất nhiều vòng sửa lỗi cẩn thận, tách riêng để tránh rủi ro
// regress khi thêm tính năng mới. Nếu công thức VAT/BHXH gốc thay đổi ở
// trang Vận hành, cần đối chiếu cập nhật lại các hàm dưới đây cho khớp.
// ══════════════════════════════════════════════════════════════════

const VAT_METHOD_CUTOVER_DATE = '2026-04-01' // Quý 2/2026 — khớp opex/page.tsx

const pad = (n: number) => String(n).padStart(2, '0')
const quarterRange = (year: number, quarter: number) => {
  const fromM = (quarter - 1) * 3 + 1
  const toM = (quarter - 1) * 3 + 3
  const fromDate = `${year}-${pad(fromM)}-01`
  const toDate = `${year}-${pad(toM)}-${pad(new Date(year, toM, 0).getDate())}`
  return { fromM, toM, fromDate, toDate }
}

interface TxRow {
  amount?: number | null
  vat_amount?: number | null
  tncn_amount?: number | null
  is_labor?: boolean | null
  is_vat_allocation?: boolean | null
  contract_id?: string | null
  project_id?: string | null
  vat_dest_project_id?: string | null
  vat_dest_amount?: number | null
  transaction_date?: string | null
  invoice_date?: string | null
}
interface ContractRow { id: string; type: string; value: number; invoice_issue_date?: string | null }
interface ProjectRow { id: string; status: string; end_date?: string | null }
interface RevenueRow { amount?: number | null; contract_id?: string | null; project_id?: string | null }

// Nghĩa vụ VAT phải nộp bù, cộng dồn qua TỪNG QUÝ có dữ liệu — mỗi quý áp đúng
// phương pháp tương ứng của opex (completion date trước Q2/2026, invoice date từ đó),
// floor 0 mỗi quý (giống hệt opex — KHÔNG chuyển số dư âm/credit dư sang quý sau).
// Cần `revenue` để tính đúng vatDauRaCompletion (doanh thu VAT của công trình nghiệm thu
// trong quý), giống hệt opex/page.tsx.
export function computeCumulativeVATFromRevenue(
  contracts: ContractRow[],
  transactions: TxRow[],
  projects: ProjectRow[],
  revenue: RevenueRow[],
): number {
  const vatContractIds = new Set(contracts.filter(c => c.type === 'vat').map(c => c.id))
  const regularTx = transactions.filter(t => !t.is_vat_allocation)

  const allDates: string[] = [
    ...projects.map(p => p.end_date).filter((d): d is string => !!d),
    ...transactions.map(t => t.transaction_date).filter((d): d is string => !!d),
    ...contracts.map(c => c.invoice_issue_date).filter((d): d is string => !!d),
  ]
  const now = new Date()
  const curYear = now.getFullYear(), curQuarter = Math.ceil((now.getMonth() + 1) / 3)
  if (allDates.length === 0) return 0
  const minYear = Math.min(...allDates.map(d => parseInt(d.slice(0, 4))), curYear)

  let total = 0
  for (let year = minYear; year <= curYear; year++) {
    const qTo = year === curYear ? curQuarter : 4
    for (let quarter = 1; quarter <= qTo; quarter++) {
      const { fromDate, toDate } = quarterRange(year, quarter)
      const inRangeDate = (d?: string | null) => d != null && d >= fromDate && d <= toDate
      const completedIds = new Set(projects.filter(p => p.status === 'completed' && inRangeDate(p.end_date)).map(p => p.id))
      const cogsTx = regularTx.filter(t => t.project_id && completedIds.has(t.project_id))
      const useInvoiceMethod = fromDate >= VAT_METHOD_CUTOVER_DATE

      let thueBu: number
      if (useInvoiceMethod) {
        const vatDauRa = contracts
          .filter(c => c.type === 'vat' && c.value > 0 && c.invoice_issue_date && inRangeDate(c.invoice_issue_date))
          .reduce((s, c) => s + (c.value - Math.round(c.value / 1.08)), 0)
        const vatDauVao = transactions
          .filter(t => !t.is_vat_allocation && (t.vat_amount ?? 0) > 0 && inRangeDate(t.invoice_date ?? t.transaction_date))
          .reduce((s, t) => s + (t.vat_amount ?? 0), 0)
        thueBu = Math.max(0, vatDauRa - vatDauVao)
      } else {
        const rangeRev = revenue.filter(r => r.project_id && completedIds.has(r.project_id))
        const revVatGross = rangeRev.filter(r => r.contract_id && vatContractIds.has(r.contract_id)).reduce((s, r) => s + (r.amount ?? 0), 0)
        const doanhThuVatNet = Math.round(revVatGross / 1.08)
        const vatDauRa = revVatGross - doanhThuVatNet
        const vatDestTx = transactions.filter(t => t.vat_dest_project_id && completedIds.has(t.vat_dest_project_id))
        const vatAllocTx = transactions.filter(t => t.is_vat_allocation && t.project_id && completedIds.has(t.project_id))
        const vatDauVao = cogsTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
          + vatAllocTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
          + vatDestTx.reduce((s, t) => s + (t.vat_dest_amount ?? 0), 0)
        thueBu = Math.max(0, vatDauRa - vatDauVao)
      }
      total += thueBu
    }
  }
  return total
}

// TNCN thầu phụ — khác 1 điểm CÓ CHỦ ĐÍCH so với opex/page.tsx: lấy TẤT CẢ giao dịch nhân công
// có tncn_amount > 0, KHÔNG lọc theo công trình đã nghiệm thu. Lý do: TNCN là tiền công ty đã
// khấu trừ ngay lúc trả thầu phụ (nghĩa vụ phát sinh tại thời điểm chi, không phụ thuộc công
// trình xong hay chưa) — lọc theo "đã nghiệm thu" sẽ bỏ sót TNCN của công trình đang chạy.
export function computeCumulativeTNCN(transactions: TxRow[]): number {
  return transactions
    .filter(t => !t.is_vat_allocation && t.is_labor && (t.tncn_amount ?? 0) > 0)
    .reduce((s, t) => s + (t.tncn_amount ?? 0), 0)
}

interface EmployeeRow {
  id: string
  employment_type: string
  base_salary: number
  bhxh_base: number
  dept?: string | null
  dependents: number
  salary_type: string
  hoa_hong_rate: number
  grab_eligible: boolean
  sort_order: number
  is_active: boolean
  chuancong: number
  official_from_month?: number | null
  official_from_year?: number | null
  bhxh_from_month?: number | null
  bhxh_from_year?: number | null
  work_days?: number[] | null
}
interface PayrollEntryRow {
  id?: string
  employee_id: string
  month: number
  year: number
  [key: string]: unknown
}
interface SalaryChangeRow {
  employee_id: string
  old_salary: number
  new_salary: number
  effective_month: number
  effective_year: number
}

// BHXH lũy kế — nhân viên: lặp TOÀN BỘ payroll_entries đã có (không giới hạn năm), calcPayroll
// tự gate theo isBhxhMonth/isProbation/isIntern như bình thường (không đổi logic). CEO: dùng
// nguyên ceoBhxhForRange (mốc 2026-01 có sẵn, không tự ý đổi), tính đủ tới HẾT tháng hiện tại
// ngay từ ngày 1 (khác nguyên tắc mốc-ngày-15 ở Vận hành) — mục đích ở đây là cảnh báo SỚM để
// dành tiền trước, không phải xem sức khỏe hiện tại.
export function computeCumulativeBHXH(
  employees: EmployeeRow[],
  payrollEntries: PayrollEntryRow[],
  salaryChanges: SalaryChangeRow[],
): number {
  const empWithChanges = attachSalaryChanges(employees, salaryChanges)
  const empMap = new Map(empWithChanges.map(e => [e.id, e]))
  let total = 0
  for (const entry of payrollEntries) {
    const emp = empMap.get(entry.employee_id)
    if (!emp) continue
    const r = calcPayroll(emp as never, entry as never, entry.month, entry.year)
    total += r.bhxhNLD + r.bhxhCTY
  }
  const now = new Date()
  const curYear = now.getFullYear(), curMonth = now.getMonth() + 1
  for (let year = 2025; year <= curYear; year++) {
    total += ceoBhxhForRange(year, 1, year === curYear ? curMonth : 12)
  }
  return total
}

export interface ObligationBreakdown {
  kind: 'vat' | 'tncn' | 'bhxh'
  label: string
  phaiNop: number
  daNop: number
  conThieu: number
}

export interface TaxObligationSummary {
  items: ObligationBreakdown[]
  tongConThieu: number
}

// Tổng hợp: nghĩa vụ lũy kế (3 hàm trên) trừ đi số ĐÃ NỘP THẬT ghi trong tax_payments
// (toàn bộ, không lọc theo kỳ — giống hệt nguồn dữ liệu opex đang dùng, chỉ khác là không
// filter theo for_month/for_year của 1 kỳ đang chọn).
export async function computeTaxObligationSummary(supabase: SupabaseClient): Promise<TaxObligationSummary> {
  const [
    { data: contracts }, { data: transactions }, { data: projects }, { data: revenue },
    { data: employees }, { data: payrollEntries }, { data: salaryChanges }, { data: taxPayments },
  ] = await Promise.all([
    supabase.from('contracts').select('id, type, value, invoice_issue_date'),
    supabase.from('transactions').select('amount, vat_amount, tncn_amount, is_labor, is_vat_allocation, contract_id, project_id, vat_dest_project_id, vat_dest_amount, transaction_date, invoice_date'),
    supabase.from('projects').select('id, status, end_date'),
    supabase.from('revenue').select('amount, contract_id, project_id'),
    supabase.from('employees').select('*'),
    supabase.from('payroll_entries').select('*'),
    supabase.from('salary_changes').select('*'),
    supabase.from('tax_payments').select('kind, amount'),
  ])

  const vatPhaiNop = computeCumulativeVATFromRevenue(contracts ?? [], transactions ?? [], projects ?? [], revenue ?? [])
  const tncnPhaiNop = computeCumulativeTNCN(transactions ?? [])
  const bhxhPhaiNop = computeCumulativeBHXH(employees ?? [], payrollEntries ?? [], salaryChanges ?? [])

  const daNopByKind = (kind: string) => (taxPayments ?? []).filter(p => p.kind === kind).reduce((s, p) => s + (p.amount ?? 0), 0)

  const items: ObligationBreakdown[] = [
    { kind: 'vat', label: 'VAT phải nộp bù', phaiNop: vatPhaiNop, daNop: daNopByKind('vat'), conThieu: Math.max(0, vatPhaiNop - daNopByKind('vat')) },
    { kind: 'tncn', label: 'TNCN thầu phụ', phaiNop: tncnPhaiNop, daNop: daNopByKind('tncn'), conThieu: Math.max(0, tncnPhaiNop - daNopByKind('tncn')) },
    { kind: 'bhxh', label: 'BHXH', phaiNop: bhxhPhaiNop, daNop: daNopByKind('bhxh'), conThieu: Math.max(0, bhxhPhaiNop - daNopByKind('bhxh')) },
  ]
  const tongConThieu = items.reduce((s, i) => s + i.conThieu, 0)
  return { items, tongConThieu }
}
