import * as XLSX from 'xlsx'
import { Employee, PayrollEntry, PayrollResult } from './calc'

const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

export interface ExportRow {
  emp: Employee
  entry: PayrollEntry | undefined
  result: PayrollResult
}

const HEADERS = [
  'STT', 'Mã NV', 'Họ tên', 'Chức danh', 'Phòng ban', 'Loại HĐ',
  'Lương HĐ (đ)', 'Lương BHXH (đ)',
  'Chuẩn công', 'Ngày công',
  'TN ngày công (đ)', 'Tăng ca (đ)',
  'TN trước thuế (đ)',
  'BHXH NLĐ 10.5% (đ)', 'BHXH CTY 21.5% (đ)',
  'Thuế TNCN (đ)',
  'Thực nhận CK (đ)',
  'PC giữ xe (đ)', 'PC đi CT (đ)', 'PC Grab/khác (đ)', 'Thưởng KPI (đ)', 'Hoa hồng (đ)',
  'Thực nhận TM (đ)',
  'Tổng thực nhận (đ)',
  'Ứng TK CTY (đ)', 'Ứng TM/CN (đ)',
  'Còn trả CK (đ)', 'Còn trả TM (đ)',
  'Số TK', 'Ngân hàng',
]

const COL_WIDTHS = [
  5, 8, 25, 22, 12, 12,
  16, 16,
  11, 11,
  16, 14,
  16,
  18, 18,
  14,
  16,
  12, 12, 14, 14, 12,
  16,
  18,
  14, 14,
  16, 16,
  18, 16,
]

export function exportPayrollToXlsx(rows: ExportRow[], month: number, year: number, advanceMap?: Map<string, { ck: number; tm: number }>) {
  const data: (string | number | null)[][] = []

  data.push(['CÔNG TY TNHH THIẾT KẾ XÂY DỰNG THƯƠNG MẠI MITCON'])
  data.push([`BẢNG THANH TOÁN TIỀN LƯƠNG ${MONTH_VN[month].toUpperCase()} ${year}`])
  data.push([])
  data.push(HEADERS)

  let stt = 0
  let totals = {
    tnTruocThue: 0, bhxhNLD: 0, bhxhCTY: 0, thueNCN: 0,
    thucNhan1: 0, thucNhan2: 0, tong: 0,
    ungCK: 0, ungTM: 0, conTraCK: 0, conTraTM: 0,
  }

  for (const { emp, entry, result } of rows) {
    const isFullSalary = (emp.salary_type ?? 'proportional') === 'full'
    if (!entry && !isFullSalary) continue

    const adv = advanceMap?.get(emp.id) ?? { ck: 0, tm: 0 }
    const conTraCK = result.thucNhan1 - adv.ck
    const conTraTM = result.thucNhan2 - adv.tm

    stt++
    data.push([
      stt,
      emp.msnv ?? '',
      emp.name,
      emp.title ?? '',
      emp.dept ?? '',
      result.isIntern ? 'Thực tập sinh' : result.isProbation ? 'Thử việc' : 'Chính thức',
      emp.base_salary,
      emp.bhxh_base,
      result.chuanCongAuto,
      isFullSalary ? 'Full' : (entry?.actual_days ?? 0),
      result.tnNgayCong,
      result.tienTC || null,
      result.tnTruocThue,
      result.bhxhNLD || null,
      result.bhxhCTY || null,
      result.thueNCN || null,
      result.thucNhan1,
      result.pcGiuXe || null,
      entry?.pc_dict || null,
      (entry?.pc_grab || 0) + (entry?.pc_khac || 0) || null,
      entry?.kpi_bonus || null,
      entry?.hoa_hong || null,
      result.thucNhan2 || null,
      result.tongThucNhan,
      adv.ck || null,
      adv.tm || null,
      conTraCK,
      conTraTM || null,
      emp.bank_account ?? '',
      emp.bank_name ?? '',
    ])

    totals.tnTruocThue += result.tnTruocThue
    totals.bhxhNLD    += result.bhxhNLD
    totals.bhxhCTY    += result.bhxhCTY
    totals.thueNCN    += result.thueNCN
    totals.thucNhan1  += result.thucNhan1
    totals.thucNhan2  += result.thucNhan2
    totals.tong       += result.tongThucNhan
    totals.ungCK      += adv.ck
    totals.ungTM      += adv.tm
    totals.conTraCK   += conTraCK
    totals.conTraTM   += conTraTM
  }

  data.push([
    'TỔNG CỘNG', '', '', '', '', '',
    null, null, null, null,
    null, null,
    totals.tnTruocThue,
    totals.bhxhNLD, totals.bhxhCTY,
    totals.thueNCN,
    totals.thucNhan1,
    null, null, null, null, null,
    totals.thucNhan2,
    totals.tong,
    totals.ungCK || null,
    totals.ungTM || null,
    totals.conTraCK,
    totals.conTraTM,
    '', '',
  ])

  data.push([])
  data.push([`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`])

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = COL_WIDTHS.map(wch => ({ wch }))

  const wb = XLSX.utils.book_new()
  const sheetName = `T${String(month).padStart(2, '0')}.${year}`
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  XLSX.writeFile(wb, `Bang_luong_${sheetName}.xlsx`)
}

// Xuất lương BHXH: chỉ phần liên quan Thực nhận 1 (TK Công ty + BHXH), bỏ các cột TM/PC/thưởng
const HEADERS_BHXH = [
  'STT', 'Mã NV', 'Họ tên', 'Chức danh', 'Phòng ban', 'Loại HĐ',
  'Lương HĐ (đ)', 'Lương BHXH (đ)',
  'Chuẩn công', 'Ngày công',
  'TN ngày công (đ)', 'Tăng ca (đ)',
  'TN trước thuế (đ)',
  'BHXH NLĐ 10.5% (đ)', 'BHXH CTY 21.5% (đ)',
  'Thuế TNCN (đ)',
  'Thực nhận CK (đ)',
  'Ứng TK CTY (đ)',
  'Còn trả CK (đ)',
  'Số TK', 'Ngân hàng',
]

const COL_WIDTHS_BHXH = [
  5, 8, 25, 22, 12, 12,
  16, 16,
  11, 11,
  16, 14,
  16,
  18, 18,
  14,
  16,
  14,
  16,
  18, 16,
]

export function exportPayrollBhxhToXlsx(rows: ExportRow[], month: number, year: number, advanceMap?: Map<string, { ck: number; tm: number }>) {
  const data: (string | number | null)[][] = []

  data.push(['CÔNG TY TNHH THIẾT KẾ XÂY DỰNG THƯƠNG MẠI MITCON'])
  data.push([`BẢNG LƯƠNG BHXH (TK CÔNG TY) ${MONTH_VN[month].toUpperCase()} ${year}`])
  data.push([])
  data.push(HEADERS_BHXH)

  let stt = 0
  let totals = { tnTruocThue: 0, bhxhNLD: 0, bhxhCTY: 0, thueNCN: 0, thucNhan1: 0, ungCK: 0, conTraCK: 0 }

  for (const { emp, entry, result } of rows) {
    const isFullSalary = (emp.salary_type ?? 'proportional') === 'full'
    if (!entry && !isFullSalary) continue

    const adv = advanceMap?.get(emp.id) ?? { ck: 0, tm: 0 }
    const conTraCK = result.thucNhan1 - adv.ck

    stt++
    data.push([
      stt,
      emp.msnv ?? '',
      emp.name,
      emp.title ?? '',
      emp.dept ?? '',
      result.isIntern ? 'Thực tập sinh' : result.isProbation ? 'Thử việc' : 'Chính thức',
      emp.base_salary,
      emp.bhxh_base,
      result.chuanCongAuto,
      isFullSalary ? 'Full' : (entry?.actual_days ?? 0),
      result.tnNgayCong,
      result.tienTC || null,
      result.tnTruocThue,
      result.bhxhNLD || null,
      result.bhxhCTY || null,
      result.thueNCN || null,
      result.thucNhan1,
      adv.ck || null,
      conTraCK,
      emp.bank_account ?? '',
      emp.bank_name ?? '',
    ])

    totals.tnTruocThue += result.tnTruocThue
    totals.bhxhNLD    += result.bhxhNLD
    totals.bhxhCTY    += result.bhxhCTY
    totals.thueNCN    += result.thueNCN
    totals.thucNhan1  += result.thucNhan1
    totals.ungCK      += adv.ck
    totals.conTraCK   += conTraCK
  }

  data.push([
    'TỔNG CỘNG', '', '', '', '', '',
    null, null, null, null,
    null, null,
    totals.tnTruocThue,
    totals.bhxhNLD, totals.bhxhCTY,
    totals.thueNCN,
    totals.thucNhan1,
    totals.ungCK || null,
    totals.conTraCK,
    '', '',
  ])

  data.push([])
  data.push([`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`])

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = COL_WIDTHS_BHXH.map(wch => ({ wch }))

  const wb = XLSX.utils.book_new()
  const sheetName = `T${String(month).padStart(2, '0')}.${year}`
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  XLSX.writeFile(wb, `Bang_luong_BHXH_${sheetName}.xlsx`)
}
