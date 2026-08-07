import { Category, ContractDocument, Project, Supplier, Transaction } from './types'

// Quy ước viết tắt hạng mục cho số hợp đồng (HDNC). Không có trong bảng → dùng quy tắc dự phòng bên dưới.
const MA_HANG_MUC_MAP: Record<string, string> = {
  'thạch cao': 'TC',
  'điện': 'DN',
  'điện nước': 'DN',
  'điện và nước': 'DN',
  'sơn nước': 'SN',
  'điện lạnh': 'DL',
  'đá': 'DA',
  'nội thất': 'NT',
  'quảng cáo': 'QC',
  'xây dựng': 'XD',
  'chống thấm': 'CT',
  'sơn pu': 'SP',
}

/** Viết tắt hạng mục: tra bảng quy ước trước, không có thì lấy chữ cái đầu mỗi từ (hoặc 2 ký tự đầu nếu 1 từ). */
export function categoryAbbr(name: string): string {
  const norm = name.trim().toLowerCase()
  if (MA_HANG_MUC_MAP[norm]) return MA_HANG_MUC_MAP[norm]
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.trim().slice(0, 2).toUpperCase()
}

// Chỉ "CK CTY" (chuyển khoản qua TK công ty) mới đủ điều kiện tự soạn Hợp đồng thầu phụ.
// "CK CN" (chuyển khoản cá nhân) KHÔNG tính — kênh này hay dùng cho các khoản chi không chính thức
// (chuyển nhầm, ứng tạm...), không nên tự động bị gom vào danh sách cần soạn hợp đồng.
export function isChuyenKhoan(note?: string | null): boolean {
  const n = (note ?? '').trim().toLowerCase()
  return n === 'ck cty' || n === 'ck công ty'
}

function isDotCuoi(description?: string | null): boolean {
  return /cuối/i.test(description ?? '')
}

function ddmmyyyyNoSep(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}${m}${y}`
}

export function formatDateVN(iso?: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Dùng Date.UTC thuần túy (không qua giờ địa phương) để tránh lệch ngày do timezone khi round-trip qua toISOString().
function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function addDays(iso: string, days: number): string {
  return new Date(toUtcMs(iso) + days * 86400000).toISOString().slice(0, 10)
}

function diffDays(fromIso: string, toIso: string): number {
  return Math.round((toUtcMs(toIso) - toUtcMs(fromIso)) / 86400000)
}

/** Nội dung mô tả điều kiện của từng đợt thanh toán, theo tổng số đợt N. */
export function installmentClauses(n: number): string[] {
  if (n <= 0) return []
  if (n === 1) return ['Khi bên B đã hoàn thành công việc được giao']
  if (n === 2) return ['Khi bên B bắt đầu thi công', 'Khi bên B đã hoàn thành công việc được giao']
  const middleCount = n - 2
  const pct = Math.floor(100 / (n - 1) / 5) * 5
  const middle = Array(middleCount).fill(`Khi bên B hoàn thành cơ bản ${pct}% khối lượng công việc được giao`)
  return ['Khi bên B bắt đầu thi công', ...middle, 'Khi bên B đã hoàn thành công việc được giao']
}

export interface ContractGroup {
  key: string
  project: Project
  category: Category
  supplierName: string
  supplier: Supplier | null
  transactions: Transaction[]
  totalAmount: number
  installmentCount: number
  installmentClauses: string[]
  signedDate: string | null
  signedDateSource: 'invoice' | 'fallback'
  completionDate: string | null
  completionDateSource: 'note' | 'formula' | null
  contractNumber: string | null
  durationDays: number | null
  hasUnsignedTx: boolean
  alreadyDrafted: boolean
  lastDraftedAt: string | null
  missing: string[]
}

export interface MaterialInvoiceRef {
  project_id: string
  category_id?: string | null
  invoice_date?: string | null
  transaction_date: string
}

export interface UnassignedGroup {
  key: string
  project: Project
  reason: 'no_category' | 'no_supplier_name'
  supplierName: string | null
  totalAmount: number
  transactionCount: number
  transactionIds: string[]
  transactions: Transaction[]
}

export interface BuildContractResult {
  groups: ContractGroup[]
  unassigned: UnassignedGroup[]
}

/** Gom các khoản chi nhân công (chuyển khoản) theo (công trình, hạng mục, thợ) và tính toàn bộ dữ liệu cần cho hợp đồng. */
export function buildContractGroups(
  laborTransactions: Transaction[],
  materialInvoices: MaterialInvoiceRef[],
  projects: Project[],
  categories: Category[],
  suppliers: Supplier[],
  contractDocs: ContractDocument[] = []
): BuildContractResult {
  const projectMap = new Map(projects.map(p => [p.id, p]))
  const categoryMap = new Map(categories.map(c => [c.id, c]))
  const supplierByName = new Map(suppliers.map(s => [s.name.trim().toLowerCase(), s]))

  // Đã soạn qua tool này chưa: tra theo transaction_id có nằm trong 1 hợp đồng đã tạo trước đó không
  // (không dựa vào labor_contract_status — cột đó là cờ kế toán bật tay để tính TNCN, không phải "đã có file .docx").
  const draftedAt = new Map<string, string>()
  for (const doc of contractDocs) {
    for (const txId of doc.transaction_ids ?? []) {
      const cur = draftedAt.get(txId)
      if (!cur || doc.created_at > cur) draftedAt.set(txId, doc.created_at)
    }
  }

  // Ngày hóa đơn vật tư VAT sớm nhất theo (project_id, category_id) — dùng làm ngày ký hợp đồng.
  // invoice_date gần như không được nhập trong app (không có ô nhập) nên luôn fallback về transaction_date.
  const earliestInvoiceDate = new Map<string, string>()
  for (const t of materialInvoices) {
    const date = t.invoice_date || t.transaction_date
    if (!date || !t.category_id) continue
    const key = `${t.project_id}|${t.category_id}`
    const cur = earliestInvoiceDate.get(key)
    if (!cur || date < cur) earliestInvoiceDate.set(key, date)
  }

  const groups = new Map<string, Transaction[]>()
  const unassignedMap = new Map<string, UnassignedGroup>()

  function addUnassigned(t: Transaction, reason: 'no_category' | 'no_supplier_name', supplierName: string | null) {
    const project = projectMap.get(t.project_id)
    if (!project) return
    const ukey = `${t.project_id}|${reason}|${(supplierName ?? '').toLowerCase()}`
    if (!unassignedMap.has(ukey)) {
      unassignedMap.set(ukey, {
        key: ukey, project, reason, supplierName, totalAmount: 0, transactionCount: 0, transactionIds: [], transactions: [],
      })
    }
    const u = unassignedMap.get(ukey)!
    u.totalAmount += t.amount
    u.transactionCount += 1
    u.transactionIds.push(t.id)
    u.transactions.push(t)
  }

  for (const t of laborTransactions) {
    if (!t.is_labor || !isChuyenKhoan(t.note)) continue
    const supplierName = (t.supplier ?? '').trim()
    if (!supplierName) { addUnassigned(t, 'no_supplier_name', null); continue }
    if (!t.category_id) { addUnassigned(t, 'no_category', supplierName); continue }
    const key = `${t.project_id}|${t.category_id}|${supplierName.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const result: ContractGroup[] = []

  for (const [key, txs] of groups) {
    const [projectId, categoryId] = key.split('|')
    const project = projectMap.get(projectId)
    const category = categoryMap.get(categoryId)
    if (!project || !category) continue

    txs.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
    const supplierName = (txs[0].supplier ?? '').trim()
    const supplier = supplierByName.get(supplierName.toLowerCase()) ?? null
    const totalAmount = txs.reduce((sum, t) => sum + t.amount, 0)
    const installmentCount = txs.length
    const missing: string[] = []

    // Ngày ký = ngày hóa đơn vật tư VAT đầu tiên của hạng mục này trong công trình này.
    // Không có vật tư nào (hạng mục thuần nhân công, VD Sơn PU tay thang) → lấy ngày chuyển khoản nhân công
    // sớm nhất trừ 10 ngày, coi như ngày bắt đầu công việc.
    const invoiceDate = earliestInvoiceDate.get(`${projectId}|${categoryId}`) ?? null
    const signedDate = invoiceDate ?? addDays(txs[0].transaction_date, -10)
    const signedDateSource: 'invoice' | 'fallback' = invoiceDate ? 'invoice' : 'fallback'

    // Ngày hoàn thành: ưu tiên khoản chi có ghi "đợt cuối" trong Nội dung, không thì lấy Ngày kết thúc công trình trừ offset.
    let completionDate: string | null = null
    let completionDateSource: 'note' | 'formula' | null = null
    const dotCuoiTx = txs.find(t => isDotCuoi(t.description))
    if (dotCuoiTx) {
      completionDate = dotCuoiTx.payment_date ?? dotCuoiTx.transaction_date
      completionDateSource = 'note'
    } else if (project.end_date) {
      const offset = category.name.trim().toLowerCase().includes('thạch cao') ? 10 : 2
      completionDate = addDays(project.end_date, -offset)
      completionDateSource = 'formula'
    } else {
      missing.push('Thiếu ngày hoàn thành: công trình chưa có Ngày kết thúc, và không có khoản chi nào ghi "đợt cuối" trong Nội dung.')
    }

    if (!supplier) {
      missing.push(`Thiếu hồ sơ Bên B: chưa có nhà cung cấp/nhà thầu tên "${supplierName}" trong danh bạ — thêm ở trang Nhà cung cấp.`)
    } else {
      if (!supplier.cccd) missing.push(`Thiếu CCCD của "${supplierName}" — bổ sung ở trang Nhà cung cấp.`)
      if (!supplier.address) missing.push(`Thiếu Địa chỉ thường trú của "${supplierName}" — bổ sung ở trang Nhà cung cấp.`)
      if (!supplier.phone) missing.push(`Thiếu SĐT của "${supplierName}" — bổ sung ở trang Nhà cung cấp.`)
    }

    const contractNumber = signedDate ? `${categoryAbbr(category.name)}/${ddmmyyyyNoSep(signedDate)}/HDNC` : null
    const durationDays = signedDate && completionDate ? diffDays(signedDate, completionDate) : null
    if (durationDays !== null && durationDays < 0) {
      missing.push('Ngày hoàn thành tính ra sớm hơn ngày ký hợp đồng — kiểm tra lại Ngày kết thúc công trình hoặc hóa đơn vật tư.')
    }

    const draftedDates = txs.map(t => draftedAt.get(t.id)).filter((d): d is string => !!d)
    const lastDraftedAt = draftedDates.length > 0 ? draftedDates.sort().slice(-1)[0] : null

    result.push({
      key,
      project,
      category,
      supplierName,
      supplier,
      transactions: txs,
      totalAmount,
      installmentCount,
      installmentClauses: installmentClauses(installmentCount),
      signedDate,
      signedDateSource,
      completionDate,
      completionDateSource,
      contractNumber,
      durationDays,
      hasUnsignedTx: txs.some(t => t.labor_contract_status === 'not_signed'),
      alreadyDrafted: lastDraftedAt !== null,
      lastDraftedAt,
      missing,
    })
  }

  const sortedGroups = result.sort((a, b) => {
    if (a.project.name !== b.project.name) return a.project.name.localeCompare(b.project.name)
    return a.category.name.localeCompare(b.category.name)
  })

  const unassigned = Array.from(unassignedMap.values())
  for (const u of unassigned) u.transactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
  unassigned.sort((a, b) => a.project.name.localeCompare(b.project.name))

  return { groups: sortedGroups, unassigned }
}
