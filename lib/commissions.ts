import type { SupabaseClient } from '@supabase/supabase-js'

// Hoa hồng công trình theo mốc "Quyết toán" — CEO chốt 2026-08: cố định 2 người, tra theo MSNV
// (không tra theo tên vì tên có thể trùng/đổi, MSNV ổn định hơn).
export const COMMISSION_RULES: { field: 'commission_hieu' | 'commission_tan'; msnv: string; rate: number; label: string }[] = [
  { field: 'commission_hieu', msnv: 'GS04',  rate: 0.01,  label: 'Hiếu (1% quyết toán)' },
  { field: 'commission_tan',  msnv: 'PTK05', rate: 0.005, label: 'Tấn (0.5% quyết toán)' },
]

export function isQuyetToanStage(stage: string): boolean {
  const s = (stage ?? '').toLowerCase()
  return s.includes('quyết toán') || s.includes('quyet toan')
}

// Kỳ lương chi trả = 1 tháng sau tháng ghi nhận quyết toán (VD 03/06 → tháng 7, CEO chốt 2026-08-05).
// Lương tháng 7 chi thật ngày 05/08 theo lịch chi lương chuẩn (salaryPayDate trong lib/cashflow.ts) —
// không cần xử lý riêng ở đây, cashflow tự áp dụng ngay khi số được cộng vào payroll_entries tháng 7.
export function payPeriod(dateStr: string): { month: number; year: number } {
  const d = new Date(dateStr + 'T00:00:00')
  let month = d.getMonth() + 1 + 1
  let year = d.getFullYear()
  while (month > 12) { month -= 12; year += 1 }
  return { month, year }
}

interface SyncProject { id: string; commission_hieu?: boolean | null; commission_tan?: boolean | null }
interface SyncRevenue { id: string; project_id: string; stage: string; collected_date?: string | null }
interface SyncContract { id: string; project_id: string; type: string; value: number }
interface SyncEmployee { id: string; msnv?: string | null }

export interface PendingCommissionRow {
  project_id: string
  employee_id: string
  revenue_id: string | null   // đợt Quyết toán gần nhất — chỉ dùng để xác định KỲ TRẢ, không phải nguồn tiền
  rate: number
  base_amount: number         // giá trị công trình đã trừ VAT — LẤY TỪ contracts.value (cộng dồn nếu nhiều HĐ)
  commission_amount: number
  pay_month: number
  pay_year: number
}

// Tính danh sách hoa hồng "nên có": công trình đã tick + đã có đợt Quyết toán ghi ngày thu.
// Cơ sở tiền = GIÁ TRỊ HỢP ĐỒNG đã trừ VAT (không phải cộng dồn các đợt thu trong bảng doanh thu —
// đợt Quyết toán trong bảng doanh thu chỉ là MỐC NGÀY để xác định kỳ lương sẽ trả, CEO chốt 2026-08-05).
export function computeExpectedCommissions(input: {
  projects: SyncProject[]; revenue: SyncRevenue[]; contracts: SyncContract[]; employees: SyncEmployee[]
}): PendingCommissionRow[] {
  const empByMsnv = new Map(input.employees.filter(e => e.msnv).map(e => [e.msnv as string, e.id]))
  const projectById = new Map(input.projects.map(p => [p.id, p]))

  // Đợt Quyết toán GẦN NHẤT mỗi công trình (nếu có nhiều HĐ, mỗi HĐ có thể có 1 đợt quyết toán riêng)
  const latestQt = new Map<string, { date: string; revenueId: string }>()
  for (const rev of input.revenue) {
    if (!rev.collected_date || !isQuyetToanStage(rev.stage)) continue
    const cur = latestQt.get(rev.project_id)
    if (!cur || rev.collected_date > cur.date) {
      latestQt.set(rev.project_id, { date: rev.collected_date, revenueId: rev.id })
    }
  }

  // Giá trị công trình đã trừ VAT — cộng dồn theo project_id nếu có nhiều hợp đồng (VAT + không VAT)
  const valueByProject = new Map<string, number>()
  for (const c of input.contracts) {
    const net = c.type === 'vat' ? Math.round(c.value / 1.08) : c.value
    valueByProject.set(c.project_id, (valueByProject.get(c.project_id) ?? 0) + net)
  }

  const rows: PendingCommissionRow[] = []
  for (const [projectId, qt] of latestQt) {
    const project = projectById.get(projectId)
    if (!project) continue
    const base = valueByProject.get(projectId) ?? 0
    if (base <= 0) continue
    const { month, year } = payPeriod(qt.date)
    for (const rule of COMMISSION_RULES) {
      if (!project[rule.field]) continue
      const employeeId = empByMsnv.get(rule.msnv)
      if (!employeeId) continue
      rows.push({
        project_id: projectId, employee_id: employeeId, revenue_id: qt.revenueId,
        rate: rule.rate, base_amount: base, commission_amount: Math.round(base * rule.rate),
        pay_month: month, pay_year: year,
      })
    }
  }
  return rows
}

// Đồng bộ vào bảng project_commissions — khóa theo (project_id, employee_id):
// thêm dòng mới, cập nhật dòng CHƯA áp dụng nếu số liệu đổi (sửa giá trị HĐ, đổi ngày quyết toán...),
// XÓA dòng chưa áp dụng không còn hợp lệ (tắt tick, xóa đợt Quyết toán...).
// Dòng ĐÃ áp dụng (đã cộng vào lương) giữ nguyên — khóa lại như snapshot lương, không tính lại.
export async function syncProjectCommissions(supabase: SupabaseClient): Promise<void> {
  const [{ data: projects }, { data: revenue }, { data: contracts }, { data: employees }] = await Promise.all([
    supabase.from('projects').select('id, commission_hieu, commission_tan'),
    supabase.from('revenue').select('id, project_id, stage, collected_date'),
    supabase.from('contracts').select('id, project_id, type, value'),
    supabase.from('employees').select('id, msnv'),
  ])

  const expected = computeExpectedCommissions({
    projects: projects ?? [], revenue: revenue ?? [], contracts: contracts ?? [], employees: employees ?? [],
  })

  const { data: existing } = await supabase
    .from('project_commissions')
    .select('id, project_id, employee_id, applied, manual_override')
  const key = (projectId: string, employeeId: string) => `${projectId}_${employeeId}`
  const existingMap = new Map((existing ?? []).map(e => [key(e.project_id, e.employee_id), e]))

  const toInsert = expected.filter(r => !existingMap.has(key(r.project_id, r.employee_id)))
  if (toInsert.length > 0) {
    await supabase.from('project_commissions').insert(toInsert)
  }

  // Đợt Sếp đã tự sửa tay kỳ lương (đặc cách, VD Trần Não → tháng 7) → KHÓA hoàn toàn, không tự tính đè lại nữa.
  for (const r of expected) {
    const e = existingMap.get(key(r.project_id, r.employee_id))
    if (!e || e.applied || e.manual_override) continue
    await supabase.from('project_commissions').update({
      revenue_id: r.revenue_id, base_amount: r.base_amount, commission_amount: r.commission_amount,
      pay_month: r.pay_month, pay_year: r.pay_year,
    }).eq('id', e.id)
  }

  const expectedKeys = new Set(expected.map(r => key(r.project_id, r.employee_id)))
  const staleIds = (existing ?? [])
    .filter(e => !e.applied && !expectedKeys.has(key(e.project_id, e.employee_id)))
    .map(e => e.id)
  if (staleIds.length > 0) {
    await supabase.from('project_commissions').delete().in('id', staleIds)
  }
}
