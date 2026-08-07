// Chi phí cố định hằng tháng — dùng chung cho trang Vận hành + tính TNDN
export interface FixedItem {
  name: string
  amount: number
  note?: string
  startYear: number
  startMonth: number
  endYear?: number     // Áp dụng tới hết tháng này (bỏ trống = còn hiệu lực)
  endMonth?: number
  group: 'co_dinh' | 'nhan_su'   // nhan_su: 2 kế toán freelance — CEO xếp vào chi phí nhân sự
}

// Đổi giá giữa chừng → tách thành 2 dòng cùng tên, khác khoảng hiệu lực.
export const FIXED_OPEX: FixedItem[] = [
  { name: 'Thuê văn phòng',          amount: 7_500_000, note: 'CK cá nhân, không VAT', startYear: 2026, startMonth: 1, group: 'co_dinh' },
  { name: 'Điện + wifi + vệ sinh',   amount: 1_000_000, startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 6, group: 'co_dinh' },
  { name: 'Điện + wifi + vệ sinh',   amount: 1_200_000, note: 'Tăng từ T7/2026', startYear: 2026, startMonth: 7, group: 'co_dinh' },
  { name: 'Nước uống + bánh kẹo',    amount:   500_000, startYear: 2026, startMonth: 1, group: 'co_dinh' },
  { name: 'Kế toán nội bộ (freelance)', amount: 3_000_000, note: 'Từ T6/2026', startYear: 2026, startMonth: 6, group: 'nhan_su' },
  { name: 'Kế toán thuế (freelance)', amount: 1_500_000, startYear: 2026, startMonth: 1, group: 'nhan_su' },
]

const afterStart = (i: FixedItem, m: number, y: number) =>
  y > i.startYear || (y === i.startYear && m >= i.startMonth)
const beforeEnd = (i: FixedItem, m: number, y: number) =>
  i.endYear == null || i.endMonth == null || y < i.endYear || (y === i.endYear && m <= i.endMonth)

export function fixedItemsForMonth(month: number, year: number): FixedItem[] {
  return FIXED_OPEX.filter(i => afterStart(i, month, year) && beforeEnd(i, month, year))
}

// Ngày tiền THẬT rời tài khoản (CEO chốt 15/7/2026):
//  - Chi phí cố định văn phòng tháng M  → chi ngày 05/M
//  - Nhân sự (kế toán freelance) tháng M → chi ngày 05 của tháng M+1
export function fixedPayDate(group: 'co_dinh' | 'nhan_su', month: number, year: number): string {
  let m = month, y = year
  if (group === 'nhan_su') {
    if (m === 12) { m = 1; y += 1 } else { m += 1 }
  }
  return `${y}-${String(m).padStart(2, '0')}-05`
}

// Các khoản cố định phát sinh trong khoảng — gộp theo tên, cộng dồn số tiền các tháng
export function fixedItemsForRange(year: number, fromMonth: number, toMonth: number): (FixedItem & { months: number[] })[] {
  const map = new Map<string, FixedItem & { months: number[] }>()
  for (let m = fromMonth; m <= toMonth; m++) {
    for (const it of fixedItemsForMonth(m, year)) {
      const cur = map.get(it.name)
      if (cur) { cur.amount += it.amount; cur.months.push(m) }
      else map.set(it.name, { ...it, months: [m] })
    }
  }
  return [...map.values()]
}

// BHXH của CEO: 1 triệu/tháng, tự nguyện đóng riêng (không qua công thức lương NLD/CTY 32% như nhân viên).
// Kế toán thuế chi hộ theo đợt 6 tháng/lần — gom chung vào "BHXH Công ty" (Phải đóng), ghi payment 1 lần cho cả đợt.
const CEO_BHXH_MONTHLY = 1_000_000
const CEO_BHXH_START_YEAR = 2026
const CEO_BHXH_START_MONTH = 1

export function ceoBhxhForRange(year: number, fromMonth: number, toMonth: number): number {
  let months = 0
  for (let m = fromMonth; m <= toMonth; m++) {
    const started = year > CEO_BHXH_START_YEAR || (year === CEO_BHXH_START_YEAR && m >= CEO_BHXH_START_MONTH)
    if (started) months++
  }
  return months * CEO_BHXH_MONTHLY
}
