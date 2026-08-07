// Vietnam public holidays (weekdays only — Sundays handled separately)
const VN_HOLIDAYS: Record<number, string[]> = {
  2025: [
    '2025-01-01',
    '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
    '2025-04-07', '2025-04-30', '2025-05-01',
    '2025-09-01', '2025-09-02',
  ],
  2026: [
    '2026-01-01',
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
    '2026-04-27', '2026-04-30', '2026-05-01',
    '2026-09-02',
  ],
}

// Saturday = 0.5 day for office roles; 1 day for construction
const OFFICE_DEPTS = ['Thiết kế', 'Marketing', 'Kinh doanh', 'Kế toán', 'Giám đốc']

// PC Giữ xe chỉ áp dụng cho văn phòng (không phải Thi công)
export const GIUXE_DEPTS = ['Thiết kế', 'Marketing']

// Hệ số lương tháng thử việc (Luật LĐ: tối thiểu 85% lương chính thức)
export const PROBATION_FACTOR = 0.85

// workDays (tùy chọn) — lịch làm việc RIÊNG của 1 nhân sự (VD thực tập sinh chỉ làm T2–T6),
// ghi đè hoàn toàn quy tắc theo phòng ban bên dưới khi có set. Mảng số thứ (0=CN..6=T7),
// mỗi ngày trong lịch riêng tính ĐỦ 1 công (không có nửa ngày như quy tắc thứ 7 mặc định).
export function calcChuanCong(
  month: number, year: number, dept: string | null | undefined,
  workDays?: number[] | null,
): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  const holidays = (VN_HOLIDAYS[year] ?? []).filter(d => parseInt(d.split('-')[1]) === month)
  const isOffice = OFFICE_DEPTS.includes(dept ?? '')
  const hasCustom = workDays != null && workDays.length > 0
  let total = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (holidays.includes(ds)) continue
    if (hasCustom) {
      if (workDays!.includes(dow)) total += 1
      continue
    }
    if (dow === 0) continue
    total += dow === 6 ? (isOffice ? 0.5 : 1) : 1
  }
  return total
}

// Số ngày tính PC giữ xe: T2..T7 đều = 1 (thứ 7 tính ĐỦ 1 lần giữ xe, khác công chuẩn 0.5)
export function calcGiuXeCong(month: number, year: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  const holidays = (VN_HOLIDAYS[year] ?? []).filter(d => parseInt(d.split('-')[1]) === month)
  let total = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dow === 0 || holidays.includes(ds)) continue  // bỏ Chủ nhật + lễ
    total += 1                                          // T2..T7 đều tính đủ 1
  }
  return total
}

export interface Employee {
  id: string
  name: string
  msnv?: string | null
  title?: string | null
  dept?: string | null
  employment_type: string
  base_salary: number
  bhxh_base: number
  chuancong: number
  dependents: number
  salary_type: string   // 'proportional' | 'full'
  hoa_hong_rate: number
  bank_account?: string | null
  bank_name?: string | null
  grab_eligible: boolean
  sort_order: number
  is_active: boolean
  start_month?: number | null
  start_year?: number | null
  official_from_month?: number | null
  official_from_year?: number | null
  bhxh_from_month?: number | null
  bhxh_from_year?: number | null
  end_month?: number | null
  end_year?: number | null
  salary_changes?: SalaryChange[]
  work_days?: number[] | null
}

// Lịch sử tăng/đổi lương — mỗi lần tăng lương ghi 1 dòng, áp dụng từ tháng/năm cụ thể.
// Không "ghi đè" employees.base_salary — base_salary giữ nguyên mức TRƯỚC lần tăng đầu tiên,
// hiệu lực áp dụng của từng đợt tăng được tra bằng effectiveBaseSalary() theo tháng đang tính.
export interface SalaryChange {
  id?: string
  employee_id: string
  old_salary: number
  new_salary: number
  effective_month: number
  effective_year: number
  note?: string | null
  created_at?: string | null
}

// Lương gốc có hiệu lực cho đúng tháng/năm đang tính — lấy đợt tăng lương GẦN NHẤT có
// effective_month/year <= tháng đang xét; chưa có đợt nào áp dụng → dùng base_salary gốc.
export function effectiveBaseSalary(
  emp: Pick<Employee, 'base_salary' | 'salary_changes'>,
  month: number,
  year: number,
): number {
  let result = emp.base_salary
  let bestKey = -1
  for (const c of emp.salary_changes ?? []) {
    const applies = year > c.effective_year || (year === c.effective_year && month >= c.effective_month)
    if (!applies) continue
    const key = c.effective_year * 12 + c.effective_month
    if (key > bestKey) { bestKey = key; result = c.new_salary }
  }
  return result
}

// Gắn lịch sử tăng lương vào từng nhân sự — dùng ở mọi nơi fetch employees rồi gọi calcPayroll.
export function attachSalaryChanges<T extends { id: string }>(
  employees: T[],
  changes: SalaryChange[],
): (T & { salary_changes: SalaryChange[] })[] {
  const byEmp = new Map<string, SalaryChange[]>()
  for (const c of changes) {
    const arr = byEmp.get(c.employee_id) ?? []
    arr.push(c)
    byEmp.set(c.employee_id, arr)
  }
  return employees.map(e => ({ ...e, salary_changes: byEmp.get(e.id) ?? [] }))
}

export interface PayrollEntry {
  id?: string
  employee_id: string
  month: number
  year: number
  actual_days: number
  overtime_hours: number          // giờ tăng ca ngày thường — hệ số 1
  overtime_hours_le?: number      // giờ tăng ca Chủ nhật/ngày lễ — hệ số 1.5
  overtime_note?: string | null   // ghi rõ ngày tăng ca — VD "5/7 (thường), 6/7 (CN)"
  // Legacy fields (still in DB, not in form)
  pc_trach_nhiem?: number
  pc_chuc_vu?: number
  pc_tinh?: number
  pc_grab: number
  kpi_bonus: number
  hoa_hong: number
  hoa_hong_note?: string | null   // ghi chú hoa hồng công trình — VD "Hoa hồng 1% CT Văn phòng Vado (2.739.863đ)"
  pc_giuxe?: number | null   // null/undefined = dùng auto; số = sửa tay
  pc_dict: number
  pc_khac: number
  pc_khac_note?: string | null
  ngay_nghi_phep: number
  ngay_nghi_ghi_chu?: string | null
  note?: string | null
  // Snapshot — trạng thái nhân viên tại thời điểm tạo entry, không bị ảnh hưởng khi thay đổi sau
  employment_type_snap?: string | null
  salary_type_snap?:     string | null
  base_salary_snap?:     number | null
  bhxh_base_snap?:       number | null
}

export interface PayrollResult {
  chuanCongAuto: number
  tnNgayCong: number
  tienTC: number
  tienTCThuong: number   // Tiền tăng ca ngày thường (hệ số 1)
  tienTCLe: number       // Tiền tăng ca CN/ngày lễ (hệ số 1.5)
  tnTruocThue: number
  giamTruTotal: number
  bhxhNLD: number
  thueNCN: number
  thucNhan1: number      // Chuyển khoản (TK)
  thucNhan2: number      // Tiền mặt (CKCN)
  pcGiuXe: number        // PC giữ xe (auto hoặc sửa tay)
  autoGiuXe: number      // Giá trị giữ xe tự động (để gợi ý trong form)
  tongThucNhan: number
  bhxhCTY: number        // Internal — not displayed
  isProbation: boolean   // Tháng này là thử việc?
  isIntern: boolean      // Thực tập sinh — không BHXH, toàn bộ chi qua Thực nhận (2)
  bhxhStarted: boolean   // Chính thức nhưng đã tới mốc bắt đầu đóng BHXH chưa?
  probationFactor: number
}

export const GIAM_TRU_CA_NHAN = 15_500_000   // NQ 110/2025
export const GIAM_TRU_PHU_THUOC = 6_200_000  // Per dependent

export function calcTax(taxable: number): number {
  if (taxable <= 0) return 0
  if (taxable <= 5_000_000)  return Math.round(taxable * 0.05)
  if (taxable <= 10_000_000) return Math.round(250_000   + (taxable - 5_000_000)  * 0.10)
  if (taxable <= 18_000_000) return Math.round(750_000   + (taxable - 10_000_000) * 0.15)
  if (taxable <= 32_000_000) return Math.round(1_950_000 + (taxable - 18_000_000) * 0.20)
  if (taxable <= 52_000_000) return Math.round(4_750_000 + (taxable - 32_000_000) * 0.25)
  if (taxable <= 80_000_000) return Math.round(9_750_000 + (taxable - 52_000_000) * 0.30)
  return Math.round(18_150_000 + (taxable - 80_000_000) * 0.35)
}

// Tháng này là thử việc? — Hướng A: so sánh với mốc "chính thức từ tháng X".
// Chưa set mốc → fallback theo trạng thái (snapshot).
export function isProbationMonth(
  emp: Pick<Employee, 'official_from_month' | 'official_from_year'>,
  employmentType: string,
  month: number,
  year: number,
): boolean {
  const ofm = emp.official_from_month
  const ofy = emp.official_from_year
  if (ofy != null && ofm != null) {
    return year < ofy || (year === ofy && month < ofm)
  }
  return employmentType === 'thu_viec'
}

// Tháng này đã bắt đầu đóng BHXH chưa? — mốc RIÊNG, tách khỏi mốc "chính thức" (85%/100% lương).
// Lý do: NV đã chính thức (100% lương) nhưng công ty có thể chưa làm xong thủ tục đăng ký BHXH.
// Chưa set mốc riêng → fallback dùng lại mốc official_from (giữ hành vi cũ cho NV không cần tách).
export function isBhxhMonth(
  emp: Pick<Employee, 'official_from_month' | 'official_from_year' | 'bhxh_from_month' | 'bhxh_from_year'>,
  month: number,
  year: number,
): boolean {
  const bfm = emp.bhxh_from_month
  const bfy = emp.bhxh_from_year
  if (bfy != null && bfm != null) {
    return year > bfy || (year === bfy && month >= bfm)
  }
  const ofm = emp.official_from_month
  const ofy = emp.official_from_year
  if (ofy != null && ofm != null) {
    return year > ofy || (year === ofy && month >= ofm)
  }
  return true
}

// NV có đang làm việc trong tháng/năm đang xét không? — so khoảng [start, end] thay vì chỉ
// dựa vào cờ is_active tĩnh (cờ is_active chỉ phản ánh trạng thái HIỆN TẠI, không có chiều thời gian
// nên tick "thôi việc" sẽ làm NV biến mất khỏi CẢ các tháng trước đó nếu không có mốc end_month/year).
// Chưa có mốc end (NV thôi việc từ trước khi tính năng này tồn tại) → fallback ẩn hoàn toàn (hành vi cũ).
export function isActiveInMonth(
  emp: Pick<Employee, 'is_active' | 'start_month' | 'start_year' | 'end_month' | 'end_year'>,
  month: number,
  year: number,
): boolean {
  if (emp.start_month != null && emp.start_year != null) {
    const afterStart = year > emp.start_year || (year === emp.start_year && month >= emp.start_month)
    if (!afterStart) return false
  }
  if (!emp.is_active) {
    if (emp.end_month != null && emp.end_year != null) {
      const afterEnd = year > emp.end_year || (year === emp.end_year && month > emp.end_month)
      return !afterEnd
    }
    return false
  }
  return true
}

// Phép năm tích lũy: 1 ngày / tháng làm việc kể từ ngày vào làm (đến hết tháng đang xét)
export function calcLeaveAccrued(
  emp: Pick<Employee, 'start_month' | 'start_year'>,
  month: number,
  year: number,
): number {
  if (!emp.start_month || !emp.start_year) return 0
  const months = (year - emp.start_year) * 12 + (month - emp.start_month) + 1
  return Math.max(0, months)
}

export function calcPayroll(
  emp: Employee,
  entry: Partial<PayrollEntry>,
  month: number,
  year: number,
): PayrollResult {
  // Dùng snapshot nếu có — tránh sai khi đổi trạng thái nhân viên sau này
  const employmentType = entry.employment_type_snap ?? emp.employment_type
  const salaryType     = entry.salary_type_snap     ?? emp.salary_type
  const baseSalary     = entry.base_salary_snap     ?? effectiveBaseSalary(emp, month, year)
  const bhxhBase       = entry.bhxh_base_snap       ?? emp.bhxh_base

  const chuanCongAuto = calcChuanCong(month, year, emp.dept, emp.work_days)
  const chuancong = chuanCongAuto > 0 ? chuanCongAuto : (emp.chuancong || 26)

  const days        = entry.actual_days       ?? 0
  const overtime    = entry.overtime_hours    ?? 0
  const overtimeLe  = entry.overtime_hours_le ?? 0
  const pcGrab   = entry.pc_grab        ?? 0
  const kpi      = entry.kpi_bonus      ?? 0
  const hoaHong  = entry.hoa_hong       ?? 0
  const pcDiCT   = entry.pc_dict        ?? 0
  const pcKhac   = entry.pc_khac        ?? 0

  const isFullSalary = (salaryType ?? 'proportional') === 'full'

  // Thử việc (85%) vs Chính thức (100%) — Hướng A theo mốc official_from
  const isProbation = isProbationMonth(emp, employmentType, month, year)
  const probationFactor = isProbation ? PROBATION_FACTOR : 1
  const effectiveBase = Math.round(baseSalary * probationFactor)

  // Thực tập sinh: không BHXH, toàn bộ chi qua Thực nhận (2)
  const isIntern = employmentType === 'thuc_tap_sinh'
  // Chỉ đóng BHXH khi: chính thức (không thử việc, không thực tập sinh) VÀ đã tới mốc bắt đầu đóng BHXH
  // (mốc riêng bhxh_from — công ty có thể chậm đăng ký BHXH dù NV đã chính thức nhận đủ 100% lương)
  const bhxhStarted = isBhxhMonth(emp, month, year)
  const isOfficial = !isProbation && !isIntern && bhxhStarted

  // PC giữ xe — auto = ngày T2..T7 (thứ 7 đủ 1) × 10k, chỉ Thiết kế/Marketing; cho sửa tay
  const hasGiuXe = GIUXE_DEPTS.includes(emp.dept ?? '')
  const autoGiuXe = hasGiuXe ? Math.round(calcGiuXeCong(month, year) * 10_000) : 0
  const pcGiuXe = entry.pc_giuxe != null ? entry.pc_giuxe : autoGiuXe

  const tnNgayCong = isFullSalary
    ? effectiveBase
    : (chuancong > 0 ? Math.round(effectiveBase * days / chuancong) : 0)

  // Tăng ca ngày thường hệ số 1 (trả đúng bằng lương giờ thường), CN/ngày lễ hệ số 1.5
  const hourlyRate = (!isFullSalary && chuancong > 0) ? effectiveBase / chuancong / 8 : 0
  const tienTCThuong = Math.round(hourlyRate * overtime * 1)
  const tienTCLe     = Math.round(hourlyRate * overtimeLe * 1.5)
  const tienTC = tienTCThuong + tienTCLe

  const tnTruocThue = tnNgayCong + tienTC

  const bhxhNLD = isOfficial ? Math.round(bhxhBase * 0.105) : 0

  const dependents = emp.dependents ?? 0
  const giamTruTotal = GIAM_TRU_CA_NHAN + dependents * GIAM_TRU_PHU_THUOC
  const taxable = Math.max(0, tnTruocThue - bhxhNLD - giamTruTotal)
  const thueNCN = calcTax(taxable)

  let thucNhan1 = tnTruocThue - bhxhNLD - thueNCN
  let thucNhan2 = pcGiuXe + pcDiCT + pcGrab + kpi + hoaHong + pcKhac
  // Thử việc & Thực tập sinh & Chính thức nhưng CHƯA tới mốc đóng BHXH: toàn bộ lương dồn vào
  // Thực nhận (2) — chi tiền mặt/CKCN, không qua CK lương — CEO chốt 2026-08-05.
  if (isProbation || isIntern || !bhxhStarted) {
    thucNhan2 += thucNhan1
    thucNhan1 = 0
  }
  const tongThucNhan = thucNhan1 + thucNhan2

  const bhxhCTY = isOfficial ? Math.round(bhxhBase * 0.215) : 0

  return {
    chuanCongAuto, tnNgayCong, tienTC, tienTCThuong, tienTCLe, tnTruocThue,
    giamTruTotal, bhxhNLD, thueNCN,
    thucNhan1, thucNhan2, pcGiuXe, autoGiuXe, tongThucNhan,
    bhxhCTY, isProbation, isIntern, bhxhStarted, probationFactor,
  }
}

export const EMPTY_ENTRY = (employeeId: string, month: number, year: number): PayrollEntry => ({
  employee_id: employeeId, month, year,
  actual_days: 0, overtime_hours: 0, overtime_hours_le: 0, overtime_note: '',
  pc_grab: 0, kpi_bonus: 0, hoa_hong: 0,
  pc_dict: 0, pc_khac: 0,   // pc_giuxe bỏ trống = dùng auto
  ngay_nghi_phep: 0, ngay_nghi_ghi_chu: '',
  note: '',
})
