import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx'
import { ContractGroup, formatDateVN, categoryAbbr } from './hopDong'
import { soTienBangChu } from './soTienBangChu'
import { formatVND } from './utils'

const FONT = 'Times New Roman'

// Tên thợ/nhà thầu (Bên B) lưu trong hệ thống thường viết HOA TOÀN BỘ (VD "BÙI NGỌC DĂNG") — dòng ký tên
// trong hợp đồng cần chữ thường kiểu tên riêng (VD "Bùi Ngọc Dăng") giống mẫu, khác với "Ông: ..." ở trên
// vẫn giữ IN HOA như cũ. Chỉ viết hoa CHỮ CÁI ĐẦU mỗi từ, hạ hết phần còn lại — an toàn với tiếng Việt có dấu.
function toTenRieng(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function p(text: string, opts: { bold?: boolean; italic?: boolean; center?: boolean; size?: number } = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : undefined,
    spacing: { after: 120 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, font: FONT, size: opts.size ?? 24 })],
  })
}

function heading(text: string) {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 24 })],
  })
}

function bullet(text: string) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: `- ${text}`, font: FONT, size: 24 })],
  })
}

function blankLine() {
  return new Paragraph({ children: [new TextRun({ text: '', font: FONT, size: 24 })] })
}

function signCell(title: string, org: string, signerName: string) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    children: [
      p(title, { bold: true, center: true }),
      p(org, { bold: true, center: true }),
      blankLine(), blankLine(), blankLine(),
      p(signerName, { bold: true, center: true }),
    ],
  })
}

export interface CompanyInfo {
  name: string
  shortName: string
  address: string
  taxCode: string
  phone: string
  signerTitle: string
  signerName: string
  representativeName: string   // Tên người đại diện — dùng cho dòng "Đại diện:" (không kèm học vị/chức danh)
  representativeTitle: string  // Chức vụ người đại diện — VD "Giám Đốc"
}

export const MITCON_INFO: CompanyInfo = {
  name: 'CÔNG TY TNHH THIẾT KẾ XÂY DỰNG THƯƠNG MẠI MITCON',
  shortName: 'Công ty TNHH TK XD TM MITCON',
  address: '30/114A Đỗ Nhuận, P. Tân Sơn Nhì, HCM',
  taxCode: '0314234626',
  phone: '0909041412',
  signerTitle: 'Ths.Ks. Trình Nguyễn Minh Thông',
  signerName: 'Ths.Ks. Trình Nguyễn Minh Thông',
  representativeName: 'Trình Nguyễn Minh Thông',
  representativeTitle: 'Giám Đốc',
}

export function contractFileName(group: ContractGroup): string {
  const abbr = categoryAbbr(group.category.name)
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').trim()
  return `HDNC_${abbr}_${safe(group.project.name)}.docx`
}

export async function generateContractDocx(group: ContractGroup, company: CompanyInfo = MITCON_INFO): Promise<Blob> {
  if (!group.signedDate || !group.completionDate || !group.contractNumber) {
    throw new Error('Thiếu dữ liệu bắt buộc (ngày ký / ngày hoàn thành) — không thể tạo hợp đồng.')
  }
  const hangMuc = group.category.name.toUpperCase()
  const hangMucThuong = group.category.name
  const [y, m, d] = group.signedDate.split('-')
  const supplier = group.supplier
  const nơiCap = supplier?.cccd_issue_place || 'Cục Cảnh Sát Quản lý Hành Chính Về Trật Tự Xã Hội'

  const children: Paragraph[] = [
    p('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, center: true }),
    p('Độc lập – Tự do – Hạnh Phúc', { bold: true, center: true }),
    p('-----', { center: true }),
    p('HỢP ĐỒNG GIAO KHOÁN NHÂN CÔNG', { bold: true, center: true, size: 28 }),
    p(`(Số: ${group.contractNumber})`, { bold: true, center: true }),
    blankLine(),
    p('Căn cứ Bộ luật Dân sự năm 2015;', { italic: true }),
    p('Căn cứ Luật Xây dựng năm 2014;', { italic: true }),
    p(`Hôm nay, ngày ${d} tháng ${m} năm ${y}`),
    p(`Tại địa chỉ công ty Mitcon: ${company.address}`),
    p('Hai bên gồm có:'),
    p(`BÊN THUÊ NHÂN CÔNG THI CÔNG HẠNG MỤC ${hangMuc} (sau đây gọi là Bên A):`, { bold: true }),
    p(company.name, { bold: true }),
    p(`MST: ${company.taxCode}`),
    p(`Địa chỉ: ${company.address}`),
    p(`Đại diện: Ông ${company.representativeName}    Chức vụ: ${company.representativeTitle}`),
    p(`Điện thoại: ${company.phone}`),
    p(`BÊN NHẬN NHÂN CÔNG THI CÔNG HẠNG MỤC ${hangMuc} (sau đây gọi là Bên B)`, { bold: true }),
    p(`Ông: ${group.supplierName.toUpperCase()}`, { bold: true }),
    p(`Địa chỉ thường trú: ${supplier?.address || '……………………………'}`),
    p(`Điện thoại: ${supplier?.phone || '……………………………'}`),
    p(`CCCD: ${supplier?.cccd || '……………………………'}`),
    p(`Ngày cấp: ${supplier?.cccd_issue_date ? formatDateVN(supplier.cccd_issue_date) : '……………………………'}`),
    p(`Nơi cấp: ${nơiCap}`),
    p(`Hai bên thỏa thuận ký hợp đồng xây dựng này, trong đó, bên A đồng ý thuê bên B đảm nhận phần nhân công thi công hạng mục ${hangMucThuong} tại công trình ${group.project.name}${group.project.address ? ` địa chỉ: ${group.project.address}` : ''}`),
    p('Với các điều khoản như sau:'),

    heading('ĐIỀU 1. NỘI DUNG CÔNG VIỆC, ĐƠN GIÁ, TIẾN ĐỘ THI CÔNG, GIÁ TRỊ HỢP ĐỒNG'),
    p('1. Nội dung công việc', { bold: true }),
    p(`Bên B sẽ thực hiện các công việc thi công hạng mục ${hangMucThuong} cho bên A theo đúng với thiết kế đã thống nhất.`),
    p('2. Giá trị hợp đồng', { bold: true }),
    p(`Tổng giá trị hợp đồng: ${formatVND(group.totalAmount).replace('₫', '').trim()} VNĐ`),
    p(`(${soTienBangChu(group.totalAmount)})`, { italic: true }),
    p('- Nghĩa vụ thuế thu nhập cá nhân: Tiền lương khoán nêu trên chưa bao gồm tiền thuế thu nhập cá nhân. Bên A có trách nhiệm nộp tiền thuế thu nhập cá nhân thay cho bên B.'),
    p(`- Các đợt thanh toán: ${group.installmentCount} đợt`),
    ...group.installmentClauses.map((clause, i) => bullet(`Đợt ${i + 1}: ${clause}`)),
    p('3. Tiến độ thi công', { bold: true }),
    p(`- Bên B phải thực hiện công việc trong vòng ${group.durationDays} ngày, tính từ ngày ${formatDateVN(group.signedDate)} đến ngày ${formatDateVN(group.completionDate)}`),

    heading('ĐIỀU 2. THANH TOÁN'),
    p('1. Các đợt thanh toán: thanh toán 1 lần sau khi hoàn thành công việc và được sự đồng ý nghiệm thu từ bên A'),
    p('2. Hình thức thanh toán: Thanh toán bằng hình thức chuyển khoản'),

    heading('ĐIỀU 3: QUYỀN VÀ NGHĨA VỤ BÊN A'),
    bullet('Yêu cầu bên B thực hiện đúng phần công việc đã ghi tại mục 1 điều 1, trong thời gian tại mục 3 điều 1.'),
    bullet('Thanh toán cho Bên B đúng hạn theo các quy định của Hợp đồng này. Nếu Bên A không thực hiện đúng nghĩa vụ thanh toán theo qui định tại hợp đồng này thì sẽ bị phạt số tiền là 2% tổng giá trị hợp đồng cho 01 ngày vi phạm tổng giá trị phạt không quá 7% giá trị hợp đồng.'),
    bullet('Yêu cầu bên B tuân thủ và chịu trách nhiệm về các quy định về an toàn, an ninh trong khu vực thi công.'),
    bullet('Các quyền và nghĩa vụ khác theo quy định của Hợp đồng này và quy định của pháp luật hiện hành.'),

    heading('ĐIỀU 4: QUYỀN VÀ NGHĨA VỤ BÊN B'),
    bullet('Được cấp phát vật tư, công cụ, dụng cụ để thực hiện công việc (nếu có).'),
    bullet('Được trả lương theo mục 2 điều 1 sau khi hoàn thành công việc theo mục 1 điều 1 với thời hạn tại mục 3 điều 1.'),
    bullet('Thực hiện đúng công việc đã ghi tại mục 1 điều 1.'),
    bullet('Hoàn thành công việc đúng thời hạn đã ghi tại mục 3 điều 1.'),
    bullet('Tuân thủ theo nội qui công trình của bên A.'),
    bullet('Toàn bộ khu vực thi công phải trải bạt xanh – cam để bảo vệ sàn của công trình, không được kéo lê trên sàn, rác thải trong khu vực thi công phải được cho vào bao tải, tập kết 1 chỗ và chuyển đi để đảm bảo vệ sinh.'),
    bullet('Mọi hư hỏng phần xây dựng – Thiết bị do bên B gây ra trong quá trình thi công phải sửa chữa và khắc phục trước khi nghiệm thu nội bộ 2 bên. Nếu bên B không khắc phục kịp trước ngày nghiệm thu 2 bên, bên A sẽ đưa công nhật vào khắc phục và sửa chữa những lỗi liên quan đến xây dựng – thiết bị (700.000 đ/1 công) và các chi phí vật tư sửa chữa khác sẽ được trừ vào phần thanh toán.'),
    bullet('Nếu bên B không thi công đúng thời hạn quy định tại hợp đồng này thì sẽ bị phạt số tiền là 2% tổng giá trị hợp đồng cho 01 ngày vi phạm.'),
    bullet('Các quyền và nghĩa vụ khác theo quy định của Hợp đồng này và quy định của pháp luật hiện hành.'),

    heading('ĐIỀU 5: QUYỀN VÀ NGHĨA VỤ CHUNG'),
    bullet('Hai bên cam kết thi hành nghiêm chỉnh các điều khoản của hợp đồng này.'),
    bullet('Mọi tranh chấp phát sinh trong quá trình thực hiện hợp đồng sẽ được giải quyết trước tiên thông qua thương lượng. Trường hợp không thương lượng được thì tranh chấp sẽ do Tòa án có thẩm quyền giải quyết.'),
    bullet('Hợp đồng này có hiệu lực kể từ ngày ký và tự động thanh lý khi hai bên đã hoàn thành trách nhiệm với nhau.'),
    bullet('Hợp đồng này được lập thành 2 bản có giá trị pháp lý như nhau, mỗi bên giữ 1 bản./.'),
    blankLine(),
  ]

  const signTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          signCell('BÊN A', company.shortName, company.signerName),
          signCell('BÊN B', 'Đơn vị nhận thầu', toTenRieng(group.supplierName)),
        ],
      }),
    ],
  })

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [...children, signTable],
      },
    ],
    styles: {
      default: {
        document: { run: { font: FONT, size: 24 } },
      },
    },
  })

  return Packer.toBlob(doc)
}
