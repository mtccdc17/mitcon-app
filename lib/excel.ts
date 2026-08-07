import * as XLSX from 'xlsx'
import { Project, Contract, Category, Transaction, Revenue } from './types'

// =============================================
// IMPORT TEMPLATE
// =============================================

export const IMPORT_HEADERS = [
  'Ngày',
  'Hợp đồng',
  'Hạng mục',
  'Loại khoản',
  'Nội dung',
  'Số tiền',
  'Loại VAT',
  'Tình trạng hóa đơn',
  'Số hóa đơn',
  'Nhà cung cấp',
  'Tình trạng HĐ nhân công',
  'Tình trạng thanh toán',
  'Ngày thanh toán',
] as const

const EXAMPLE_ROWS = [
  ['11/05/2026', 'Xuất VAT', 'Nội thất', 'Vật tư', 'Vật tư ván', 29722352, 'VAT 10%', 'Đã có HĐ', '127', 'Ván Hoàng Gia', '', 'Đã thanh toán', '11/05/2026'],
  ['12/05/2026', 'Xuất VAT', 'Nội thất', 'Nhân công', 'Ứng đội gỗ Bùi Ngọc Đăng', 15000000, '', '', '', '', 'Chưa làm HĐ', 'Đã thanh toán', '12/05/2026'],
  ['16/05/2026', 'Không HĐ', 'Điện', 'Vật tư', 'Đèn trang trí', 765000, 'Không VAT', 'Không có HĐ', '', '', '', 'Chưa thanh toán', ''],
]

const NOTE_LINES = [
  'HƯỚNG DẪN NHẬP LIỆU — Mitcon Finance',
  '',
  '1. Mỗi dòng là 1 khoản chi. Không xóa dòng tiêu đề (dòng 1).',
  '2. Ngày: định dạng dd/mm/yyyy (VD: 11/05/2026).',
  '3. Hợp đồng: chỉ ghi "Xuất VAT" hoặc "Không HĐ".',
  '4. Hạng mục: tên hạng mục (VD: Nội thất, Điện, Sơn nước...). Nếu chưa có trong công trình, hệ thống sẽ tự tạo.',
  '5. Loại khoản: chỉ ghi "Vật tư" hoặc "Nhân công".',
  '6. Số tiền: chỉ ghi số, không ghi đơn vị (VND).',
  '7. Loại VAT (chỉ áp dụng Vật tư): "Không VAT", "VAT 10%", "VAT 8%".',
  '8. Tình trạng hóa đơn (chỉ Vật tư): "Không có HĐ", "Chờ xuất HĐ", "Đã có HĐ".',
  '9. Tình trạng HĐ nhân công (chỉ Nhân công): "Chưa làm HĐ" hoặc "Đã làm HĐ".',
  '10. Tình trạng thanh toán: "Chưa thanh toán", "TT một phần", "Đã thanh toán".',
  '11. Xem 3 dòng ví dụ trong sheet "Dữ liệu" để biết cách điền.',
]

export function downloadImportTemplate(projectName: string) {
  const wb = XLSX.utils.book_new()

  const dataSheet = XLSX.utils.aoa_to_sheet([
    [...IMPORT_HEADERS],
    ...EXAMPLE_ROWS,
  ])
  dataSheet['!cols'] = IMPORT_HEADERS.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Dữ liệu')

  const noteSheet = XLSX.utils.aoa_to_sheet(NOTE_LINES.map(line => [line]))
  noteSheet['!cols'] = [{ wch: 90 }]
  XLSX.utils.book_append_sheet(wb, noteSheet, 'Hướng dẫn')

  XLSX.writeFile(wb, `Mau_nhap_lieu_${slugify(projectName)}.xlsx`)
}

// =============================================
// PARSE IMPORT FILE
// =============================================

export interface ParsedTransactionRow {
  rowIndex: number
  date: string
  contractType: 'vat' | 'no_vat'
  categoryName: string
  isLabor: boolean
  description: string
  amount: number
  vatRate: 'no_vat' | 'vat_10' | 'vat_8'
  invoiceStatus: 'no_invoice' | 'waiting' | 'has_invoice'
  invoiceNumber: string
  supplier: string
  laborContractStatus: 'not_signed' | 'signed'
  paymentStatus: 'pending' | 'partial' | 'paid'
  paymentDate: string
  error?: string
}

const VAT_MAP: Record<string, 'no_vat' | 'vat_10' | 'vat_8'> = {
  'không vat': 'no_vat', 'vat 10%': 'vat_10', 'vat 8%': 'vat_8',
}
const INVOICE_MAP: Record<string, 'no_invoice' | 'waiting' | 'has_invoice'> = {
  'không có hđ': 'no_invoice', 'chờ xuất hđ': 'waiting', 'đã có hđ': 'has_invoice',
}
const LABOR_CONTRACT_MAP: Record<string, 'not_signed' | 'signed'> = {
  'chưa làm hđ': 'not_signed', 'đã làm hđ': 'signed',
}
const PAYMENT_MAP: Record<string, 'pending' | 'partial' | 'paid'> = {
  'chưa thanh toán': 'pending', 'tt một phần': 'partial', 'đã thanh toán': 'paid',
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

function excelDateToISO(value: unknown): string {
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str = String(value ?? '').trim()
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return str
}

export async function parseImportFile(file: File): Promise<ParsedTransactionRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const sheet = wb.Sheets['Dữ liệu'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true })

  const dataRows = rows.slice(1).filter(r => r.some(c => c !== undefined && c !== ''))

  return dataRows.map((r, i) => {
    const [date, contract, category, kind, desc, amount, vatRate, invoiceStatus, invoiceNumber, supplier, laborStatus, paymentStatus, paymentDate] = r

    const isLabor = norm(kind) === 'nhân công'
    const contractType: 'vat' | 'no_vat' = norm(contract) === 'không hđ' ? 'no_vat' : 'vat'
    const amountNum = Number(amount)

    let error: string | undefined
    if (!date) error = 'Thiếu ngày'
    else if (!category) error = 'Thiếu hạng mục'
    else if (!desc) error = 'Thiếu nội dung'
    else if (!amountNum || amountNum <= 0) error = 'Số tiền không hợp lệ'

    return {
      rowIndex: i + 2,
      date: excelDateToISO(date),
      contractType,
      categoryName: String(category ?? '').trim(),
      isLabor,
      description: String(desc ?? '').trim(),
      amount: amountNum || 0,
      vatRate: VAT_MAP[norm(vatRate)] ?? 'no_vat',
      invoiceStatus: INVOICE_MAP[norm(invoiceStatus)] ?? 'no_invoice',
      invoiceNumber: String(invoiceNumber ?? '').trim(),
      supplier: String(supplier ?? '').trim(),
      laborContractStatus: LABOR_CONTRACT_MAP[norm(laborStatus)] ?? 'not_signed',
      paymentStatus: PAYMENT_MAP[norm(paymentStatus)] ?? 'pending',
      paymentDate: paymentDate ? excelDateToISO(paymentDate) : '',
      error,
    }
  })
}

// =============================================
// EXPORT — single project
// =============================================

export function exportProjectToExcel(
  project: Project,
  contracts: Contract[],
  categories: Category[],
  transactions: Transaction[],
  revenue: Revenue[]
) {
  const wb = XLSX.utils.book_new()
  const catName = (id?: string) => categories.find(c => c.id === id)?.name ?? ''
  const contractLabel = (id?: string) => {
    const c = contracts.find(c => c.id === id)
    return c?.type === 'vat' ? 'Xuất VAT' : c?.type === 'no_vat' ? 'Không HĐ' : ''
  }

  const VAT_LABEL: Record<string, string> = { vat_10: 'VAT 10%', vat_8: 'VAT 8%', no_vat: 'Không VAT' }
  const INVOICE_LABEL: Record<string, string> = { has_invoice: 'Đã có HĐ', waiting: 'Chờ xuất HĐ', no_invoice: 'Không có HĐ' }
  const PAYMENT_LABEL: Record<string, string> = { paid: 'Đã thanh toán', partial: 'TT một phần', pending: 'Chưa thanh toán' }
  const LABOR_LABEL: Record<string, string> = { signed: 'Đã làm HĐ', not_signed: 'Chưa làm HĐ' }

  const txRows = transactions.map(t => ({
    'Ngày': t.transaction_date,
    'Hợp đồng': contractLabel(t.contract_id),
    'Hạng mục': catName(t.category_id),
    'Loại khoản': t.is_labor ? 'Nhân công' : 'Vật tư',
    'Nội dung': t.description,
    'Số tiền': t.amount,
    'VAT': t.is_labor ? 0 : t.vat_amount,
    'TNCN': t.is_labor ? t.tncn_amount : 0,
    'Loại VAT': t.is_labor ? '' : VAT_LABEL[t.vat_rate],
    'Tình trạng hóa đơn': t.is_labor ? '' : INVOICE_LABEL[t.invoice_status],
    'Số hóa đơn': t.invoice_number ?? '',
    'Nhà cung cấp': t.supplier ?? '',
    'Tình trạng HĐ nhân công': t.is_labor ? LABOR_LABEL[t.labor_contract_status] : '',
    'Tình trạng thanh toán': PAYMENT_LABEL[t.payment_status],
    'Ngày thanh toán': t.payment_date ?? '',
    'Đơn vị nhập': t.unit,
  }))
  const txSheet = XLSX.utils.json_to_sheet(txRows)
  XLSX.utils.book_append_sheet(wb, txSheet, 'Chi phí')

  const revRows = revenue.map(r => ({
    'Đợt': r.stage,
    'Hợp đồng': contractLabel(r.contract_id),
    'Số tiền': r.amount,
    'Ngày thu': r.collected_date ?? '',
    'Trạng thái': r.status === 'collected' ? 'Đã thu' : 'Chưa thu',
    'Hình thức': r.payment_method,
    'Ghi chú': r.note ?? '',
  }))
  const revSheet = XLSX.utils.json_to_sheet(revRows)
  XLSX.utils.book_append_sheet(wb, revSheet, 'Doanh thu')

  const vatContract = contracts.find(c => c.type === 'vat')
  const noVatContract = contracts.find(c => c.type === 'no_vat')
  const summary = [
    ['Tên công trình', project.name],
    ['Khách hàng', project.customer_name],
    ['Địa chỉ', project.address ?? ''],
    ['Trạng thái', project.status],
    ['Giá trị HĐ Xuất VAT', vatContract?.value ?? 0],
    ['Giá trị HĐ Không HĐ', noVatContract?.value ?? 0],
    ['Tổng chi phí', transactions.reduce((s, t) => s + t.amount, 0)],
    ['Tổng VAT', transactions.reduce((s, t) => s + (t.vat_amount ?? 0), 0)],
    ['Tổng TNCN', transactions.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)],
    ['Tổng doanh thu', revenue.reduce((s, r) => s + r.amount, 0)],
    ['Ngày xuất báo cáo', new Date().toLocaleString('vi-VN')],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summary)
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Tổng quan')

  XLSX.writeFile(wb, `${slugify(project.name)}_${dateStamp()}.xlsx`)
}

// =============================================
// EXPORT — báo cáo chi phí hóa đơn hợp lệ về thuế (đối chiếu tờ khai GTGT/TNDN)
// =============================================

// Cùng tiêu chí "hợp lệ" đang dùng để tính CP hợp lệ (TNDN) ở trang chi tiết công trình:
//   Vật tư: có VAT ghi nhận (vat_amount > 0) — nghĩa là có hóa đơn VAT thật
//   Nhân công: có TNCN đã khấu trừ (tncn_amount > 0) — nghĩa là có hồ sơ/hợp đồng hợp lệ
export function exportTaxInvoiceReport(
  project: Project,
  transactions: Transaction[],
  categories: Category[]
) {
  const wb = XLSX.utils.book_new()
  const catName = (id?: string) => categories.find(c => c.id === id)?.name ?? ''
  const VAT_LABEL: Record<string, string> = { vat_10: 'VAT 10%', vat_8: 'VAT 8%', no_vat: 'Không VAT' }

  const vatTx = transactions.filter(t => !t.is_labor && (t.vat_amount ?? 0) > 0)
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
  const laborTx = transactions.filter(t => t.is_labor && (t.tncn_amount ?? 0) > 0)
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))

  const vtRows = vatTx.map(t => ({
    'Ngày xuất': t.transaction_date,
    'Hạng mục': catName(t.category_id),
    'Nhà cung cấp': t.supplier ?? '',
    'Nội dung': t.description,
    'Số tiền': t.amount,
    'Thuế suất': VAT_LABEL[t.vat_rate] ?? '',
    'Tiền VAT': t.vat_amount ?? 0,
    'Mã số hóa đơn': t.invoice_number ?? '',
  }))
  vtRows.push({
    'Ngày xuất': '', 'Hạng mục': '', 'Nhà cung cấp': '', 'Nội dung': 'TỔNG CỘNG',
    'Số tiền': vatTx.reduce((s, t) => s + t.amount, 0),
    'Thuế suất': '', 'Tiền VAT': vatTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0),
    'Mã số hóa đơn': '',
  })
  const vtSheet = XLSX.utils.json_to_sheet(vtRows)
  vtSheet['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 26 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, vtSheet, 'Vật tư')

  const ncRows = laborTx.map(t => ({
    'Ngày': t.transaction_date,
    'Hạng mục': catName(t.category_id),
    'Tên nhân công': t.supplier ?? '',
    'Nội dung': t.description,
    'Số tiền': t.amount,
    'TNCN đã khấu trừ': t.tncn_amount ?? 0,
  }))
  ncRows.push({
    'Ngày': '', 'Hạng mục': '', 'Tên nhân công': '', 'Nội dung': 'TỔNG CỘNG',
    'Số tiền': laborTx.reduce((s, t) => s + t.amount, 0),
    'TNCN đã khấu trừ': laborTx.reduce((s, t) => s + (t.tncn_amount ?? 0), 0),
  })
  const ncSheet = XLSX.utils.json_to_sheet(ncRows)
  ncSheet['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 26 }, { wch: 28 }, { wch: 14 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ncSheet, 'Nhân công')

  const summary = [
    ['Công trình', project.name],
    ['Khách hàng', project.customer_name],
    ['Tổng chi phí vật tư hợp lệ (chưa VAT)', vatTx.reduce((s, t) => s + t.amount - (t.vat_amount ?? 0), 0)],
    ['Tổng tiền VAT được khấu trừ', vatTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0)],
    ['Tổng chi phí nhân công hợp lệ', laborTx.reduce((s, t) => s + t.amount, 0)],
    ['Tổng TNCN đã khấu trừ', laborTx.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)],
    ['Ngày xuất báo cáo', new Date().toLocaleString('vi-VN')],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summary)
  summarySheet['!cols'] = [{ wch: 34 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Tổng quan')

  XLSX.writeFile(wb, `Hoa_don_hop_le_${slugify(project.name)}_${dateStamp()}.xlsx`)
}

// =============================================
// EXPORT — full system backup
// =============================================

interface FullSystemData {
  projects: Project[]
  contracts: Contract[]
  categories: Category[]
  transactions: Transaction[]
  revenue: Revenue[]
  operatingCosts: { month: number; year: number; description: string; amount: number; cost_type: string; is_deductible: boolean; note?: string | null }[]
}

export function exportFullSystemToExcel(data: FullSystemData) {
  const wb = XLSX.utils.book_new()
  const projectName = (id: string) => data.projects.find(p => p.id === id)?.name ?? ''
  const catName = (id?: string) => data.categories.find(c => c.id === id)?.name ?? ''
  const contractLabel = (id?: string) => {
    const c = data.contracts.find(c => c.id === id)
    return c?.type === 'vat' ? 'Xuất VAT' : c?.type === 'no_vat' ? 'Không HĐ' : ''
  }

  const projectRows = data.projects.map(p => {
    const vatC = data.contracts.find(c => c.project_id === p.id && c.type === 'vat')
    const noVatC = data.contracts.find(c => c.project_id === p.id && c.type === 'no_vat')
    const projTx = data.transactions.filter(t => t.project_id === p.id)
    const projRev = data.revenue.filter(r => r.project_id === p.id)
    return {
      'Tên công trình': p.name,
      'Khách hàng': p.customer_name,
      'Trạng thái': p.status,
      'Giá trị HĐ VAT': vatC?.value ?? 0,
      'Giá trị HĐ Không HĐ': noVatC?.value ?? 0,
      'Tổng chi phí': projTx.reduce((s, t) => s + t.amount, 0),
      'Tổng VAT': projTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0),
      'Tổng TNCN': projTx.reduce((s, t) => s + (t.tncn_amount ?? 0), 0),
      'Tổng doanh thu': projRev.reduce((s, r) => s + r.amount, 0),
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectRows), 'Tổng quan công trình')

  const txRows = data.transactions.map(t => ({
    'Công trình': projectName(t.project_id),
    'Ngày': t.transaction_date,
    'Hợp đồng': contractLabel(t.contract_id),
    'Hạng mục': catName(t.category_id),
    'Loại khoản': t.is_labor ? 'Nhân công' : 'Vật tư',
    'Nội dung': t.description,
    'Số tiền': t.amount,
    'VAT': t.is_labor ? 0 : t.vat_amount,
    'TNCN': t.is_labor ? t.tncn_amount : 0,
    'Tình trạng thanh toán': t.payment_status,
    'Nhà cung cấp': t.supplier ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Chi tiết chi phí')

  const revRows = data.revenue.map(r => ({
    'Công trình': projectName(r.project_id),
    'Đợt': r.stage,
    'Số tiền': r.amount,
    'Ngày thu': r.collected_date ?? '',
    'Trạng thái': r.status === 'collected' ? 'Đã thu' : 'Chưa thu',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(revRows), 'Chi tiết doanh thu')

  const opexRows = data.operatingCosts.map(o => ({
    'Tháng': o.month,
    'Năm': o.year,
    'Loại': o.cost_type,
    'Mô tả': o.description,
    'Số tiền': o.amount,
    'Được khấu trừ': o.is_deductible ? 'Có' : 'Không',
    'Ghi chú': o.note ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(opexRows), 'Chi phí vận hành')

  XLSX.writeFile(wb, `Mitcon_Backup_Toanbo_${dateStamp()}.xlsx`)
}

// =============================================
// SUPPLIERS EXPORT / IMPORT
// =============================================

export function exportSuppliers(suppliers: { name: string; tax_code?: string | null; cccd?: string | null; phone?: string | null; contact_person?: string | null; note?: string | null }[]) {
  const wb = XLSX.utils.book_new()
  const rows = suppliers.map(s => ({
    'Tên công ty / Nhà thầu': s.name,
    'Mã số thuế (MST)': s.tax_code ?? '',
    'CCCD': s.cccd ?? '',
    'Số điện thoại': s.phone ?? '',
    'Người liên hệ': s.contact_person ?? '',
    'Ghi chú': s.note ?? '',
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, sheet, 'Nhà cung cấp')
  XLSX.writeFile(wb, `Nha_cung_cap_${dateStamp()}.xlsx`)
}

export function downloadSuppliersTemplate() {
  const wb = XLSX.utils.book_new()
  const headers = ['Tên công ty / Nhà thầu', 'Mã số thuế (MST)', 'CCCD', 'Số điện thoại', 'Người liên hệ', 'Ghi chú']
  const examples = [
    ['Công ty TNHH Ván Hoàng Gia', '0312345678', '', '0901234567', 'Anh Hùng', 'Cung cấp ván gỗ công nghiệp'],
    ['Thợ Nguyễn Văn Minh', '', '079123456789', '0912345678', '', 'Thợ sơn nước'],
    ['Cty Đèn Trang Trí Ánh Sáng', '0398765432', '', '0938765432', 'Chị Lan', ''],
  ]
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...examples])
  sheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, sheet, 'Nhà cung cấp')
  const noteSheet = XLSX.utils.aoa_to_sheet([
    ['HƯỚNG DẪN NHẬP DANH SÁCH NHÀ CUNG CẤP'],
    [''],
    ['1. Cột "Tên công ty / Nhà thầu": BẮT BUỘC.'],
    ['2. Công ty: điền MST. Cá nhân/thợ: điền CCCD.'],
    ['3. Không cần điền tất cả cột, chỉ cần tên là đủ.'],
    ['4. Xem 3 dòng ví dụ trong sheet "Nhà cung cấp".'],
  ].map(r => [r[0]]))
  noteSheet['!cols'] = [{ wch: 60 }]
  XLSX.utils.book_append_sheet(wb, noteSheet, 'Hướng dẫn')
  XLSX.writeFile(wb, 'Mau_nha_cung_cap.xlsx')
}

export interface ParsedSupplierRow {
  rowIndex: number
  name: string
  tax_code: string
  cccd: string
  phone: string
  contact_person: string
  note: string
  error?: string
}

export async function parseSuppliersFile(file: File): Promise<ParsedSupplierRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets['Nhà cung cấp'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== undefined && String(c).trim() !== ''))
  return dataRows.map((r, i) => {
    const [name, tax_code, cccd, phone, contact_person, note] = r.map(c => String(c ?? '').trim())
    return {
      rowIndex: i + 2,
      name: name ?? '',
      tax_code: tax_code ?? '',
      cccd: cccd ?? '',
      phone: phone ?? '',
      contact_person: contact_person ?? '',
      note: note ?? '',
      error: !name ? 'Thiếu tên' : undefined,
    }
  })
}

function slugify(str: string): string {
  return str
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function dateStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
