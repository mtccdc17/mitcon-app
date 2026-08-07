const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
const NHOM_CO_SO = ['', 'nghìn', 'triệu'] // lặp lại theo mỗi 3 nhóm, mỗi vòng lặp thêm 1 "tỷ"

// Đọc 1 nhóm 3 chữ số (0-999) thành chữ.
// isFirstGroup: nhóm ý nghĩa nhất (khác 0, ở vị trí cao nhất) của toàn bộ số — không cần chèn "không trăm".
function docNhomBaChuSo(nhom: number, isFirstGroup: boolean): string {
  const tram = Math.floor(nhom / 100)
  const chuc = Math.floor((nhom % 100) / 10)
  const donvi = nhom % 10
  const parts: string[] = []

  if (tram > 0) {
    parts.push(CHU_SO[tram], 'trăm')
  } else if (!isFirstGroup && (chuc > 0 || donvi > 0)) {
    parts.push('không', 'trăm')
  }

  if (chuc === 0) {
    if (donvi > 0 && (tram > 0 || !isFirstGroup)) parts.push('linh', CHU_SO[donvi])
    else if (donvi > 0) parts.push(CHU_SO[donvi])
  } else if (chuc === 1) {
    parts.push('mười')
    if (donvi === 5) parts.push('lăm')
    else if (donvi > 0) parts.push(CHU_SO[donvi])
  } else {
    parts.push(CHU_SO[chuc], 'mươi')
    if (donvi === 1) parts.push('mốt')
    else if (donvi === 5) parts.push('lăm')
    else if (donvi > 0) parts.push(CHU_SO[donvi])
  }

  return parts.join(' ')
}

// Nhãn đơn vị của nhóm thứ i (0 = hàng đơn vị, 1 = nghìn, 2 = triệu, 3 = tỷ, 4 = nghìn tỷ, 5 = triệu tỷ, 6 = tỷ tỷ...)
function nhanDonVi(i: number): string {
  const vongTy = Math.floor(i / 3)
  const co_so = NHOM_CO_SO[i % 3]
  const tyPart = vongTy > 0 ? Array(vongTy).fill('tỷ').join(' ') : ''
  return [co_so, tyPart].filter(Boolean).join(' ')
}

/** Chuyển số tiền VNĐ (số nguyên, >= 0) sang chữ tiếng Việt, viết hoa chữ đầu. VD: 4200000 -> "Bốn triệu hai trăm nghìn đồng" */
export function soTienBangChu(amount: number): string {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return 'Không đồng'

  const groups: number[] = []
  let rest = n
  while (rest > 0) {
    groups.push(rest % 1000)
    rest = Math.floor(rest / 1000)
  }

  const firstMeaningfulIdx = groups.length - 1
  const words: string[] = []

  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    const groupWords = docNhomBaChuSo(g, i === firstMeaningfulIdx)
    const unit = nhanDonVi(i)
    words.push(unit ? `${groupWords} ${unit}` : groupWords)
  }

  const result = words.join(' ').replace(/\s+/g, ' ').trim()
  return `${result.charAt(0).toUpperCase()}${result.slice(1)} đồng`
}
