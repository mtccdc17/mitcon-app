'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OperatingCost, Project, Contract, Category, Transaction, Revenue } from '@/lib/types'
import { formatVND, formatVNDShort } from '@/lib/utils'
import { Plus, X, Download, Pencil, Trash2 } from 'lucide-react'
import { exportFullSystemToExcel } from '@/lib/excel'
import CashflowBox, { CashflowData } from '@/components/CashflowBox'
import CashflowHistoryModal from '@/components/CashflowHistoryModal'
import CashflowAsOfModal from '@/components/CashflowAsOfModal'
import ChotSoButton, { ChotSoSettings } from '@/components/ChotSoButton'
import ChuyenTienPanel, { Transfer } from '@/components/ChuyenTienPanel'
import SiteAdvancePanel, { SiteAdvance } from '@/components/SiteAdvancePanel'
import PersonalExpensesTab, { type ChannelDeposit } from '@/app/(app)/revenue/PersonalExpensesTab'
import { fixedPayDate, type FixedItem } from '@/lib/opexFixed'

const COST_TYPES = [
  { value: 'ads',              label: 'Chạy ADS / Quảng cáo' },
  { value: 'design_freelance', label: 'Thiết kế Freelancer' },
  { value: 'equipment',        label: 'Thiết bị / Máy tính (có VAT)' },
  { value: 'bonus',            label: 'Thưởng ngoài (không khấu trừ)' },
  { value: 'other',            label: 'Chi phí khác' },
]
const SOURCE_CHANNELS = [
  { value: 'tk_cty', label: 'TK Công ty' },
  { value: 'tk_cn',  label: 'TK Cá nhân' },
  { value: 'tm',     label: 'Tiền mặt' },
]
const CHANNEL_LABEL: Record<string, string> = { tk_cty: 'TK Công ty', tk_cn: 'TK Cá nhân', tm: 'Tiền mặt' }
const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                   'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

interface PersonalExpenseRow {
  id: string; date: string; description: string; category: string; channel: string; amount: number; notes?: string | null
}
interface PersonalLoanRow {
  id: string; date: string; description: string; amount: number; channel: string
  repaid_amount: number; repaid_channel?: string | null; repaid_date?: string | null; notes?: string | null
}
interface FixedPayment {
  id: string; month: number; year: number; item_name: string; amount: number
  source_channel: string; paid_date?: string | null
}
export interface TaxPayment {
  id: string; kind: string; amount: number; paid_date: string
  source_channel: string; note?: string | null
  for_month?: number | null; for_year?: number | null
}
type FixedRangeItem = FixedItem & { months: number[] }

interface Props {
  period: string
  month: number
  quarter: number
  year: number
  fromMonth: number
  toMonth: number
  userId: string
  doanhThuTong: number
  doanhThuDaThu: number
  chiPhiVanHanh: number
  completedProjects: { id: string; name: string; end_date: string }[]
  wipCount: number
  fixedCoDinh: FixedRangeItem[]
  fixedNhanSu: FixedRangeItem[]
  payrollTN1: number
  payrollTN2: number
  payrollBhxhNLD: number
  payrollBhxhCTY: number
  ceoBhxh: number
  designFreelance: OperatingCost[]
  adsCosts: OperatingCost[]
  otherCosts: OperatingCost[]
  tncnThauPhu: number
  thueBu: number
  vatDauRa: number
  vatDauVao: number
  vatMethod: 'invoice' | 'completion'
  profitTable: {
    doanhThuVatNet: number; doanhThuKhongVat: number; chiPhiHdVat: number
    chiPhiHdKhongVat: number; laiGop: number; chiPhiVanHanh: number
    loiNhuan: number; chiPhiDoDang: number
  }
  taxTable: {
    doanhThuVatNet: number; chiPhiVatTu: number; chiPhiNhanCong: number
    chiPhiVanHanh: number; bhxh: number; coSo: number; tndn: number
  }
  cashflow: CashflowData
  chotSo: ChotSoSettings | null
  transfers: Transfer[]
  siteAdvances: SiteAdvance[]
  personalExpenses: PersonalExpenseRow[]
  personalLoans: PersonalLoanRow[]
  channelDeposits: ChannelDeposit[]
  fixedPayments: FixedPayment[]
  taxPayments: TaxPayment[]
  backupData: {
    projects: Project[]; contracts: Contract[]; categories: Category[]
    transactions: Transaction[]; revenue: Revenue[]; operatingCosts: OperatingCost[]
  }
}

export default function OpexClient({
  period, month, quarter, year, fromMonth, toMonth, userId,
  doanhThuTong, doanhThuDaThu, chiPhiVanHanh, completedProjects, wipCount,
  fixedCoDinh, fixedNhanSu, payrollTN1, payrollTN2, payrollBhxhNLD, payrollBhxhCTY, ceoBhxh,
  designFreelance, adsCosts, otherCosts, tncnThauPhu, thueBu, vatDauRa, vatDauVao, vatMethod,
  profitTable, taxTable,
  cashflow, chotSo, transfers, siteAdvances, personalExpenses, personalLoans, channelDeposits,
  fixedPayments, taxPayments,
  backupData,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [editing, setEditing] = useState<OperatingCost | null>(null)
  const [addType, setAddType] = useState<string | null>(null)
  const [taxKind, setTaxKind] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const bhxhTotal = payrollBhxhNLD + payrollBhxhCTY + ceoBhxh
  const isMonth = period === 'thang'
  const defaultDate = (() => {
    const now = new Date()
    return (now.getFullYear() === year && now.getMonth() + 1 >= fromMonth && now.getMonth() + 1 <= toMonth)
      ? now.toISOString().slice(0, 10)
      : `${year}-${String(fromMonth).padStart(2, '0')}-01`
  })()

  function setPeriod(p: string) {
    const q = new URLSearchParams({ period: p, year: String(year) })
    if (p === 'thang') q.set('month', String(month))
    if (p === 'quy') q.set('quarter', String(quarter))
    router.push(`/ceo/opex?${q}`)
  }
  function setValue(k: string, v: string) {
    const q = new URLSearchParams({ period, year: String(year), month: String(month), quarter: String(quarter) })
    q.set(k, v)
    router.push(`/ceo/opex?${q}`)
  }

  // ── Chi phí phát sinh: thêm / sửa / xóa ──
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const spent = (form.get('spent_date') as string) || defaultDate
    const d = new Date(spent + 'T00:00:00')
    const payload = {
      spent_date: spent,
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      source_channel: (form.get('source_channel') as string) || 'tk_cty',
      description: form.get('description') as string,
      amount: parseInt(form.get('amount') as string || '0', 10),
      cost_type: form.get('cost_type') as string,
      vat_rate: form.get('vat_rate') as string || 'no_vat',
      tax_type: form.get('tax_type') as string || 'non_deductible',
      is_deductible: form.get('tax_type') !== 'non_deductible',
      note: form.get('note') as string || null,
    }
    if (editing) await supabase.from('operating_costs').update(payload).eq('id', editing.id)
    else await supabase.from('operating_costs').insert({ created_by: userId, ...payload })
    setLoading(false)
    setEditing(null); setAddType(null)
    router.refresh()
  }
  async function handleDelete(id: string) {
    if (!confirm('Xóa khoản chi phí này?')) return
    await supabase.from('operating_costs').delete().eq('id', id)
    router.refresh()
  }

  // ── Chi phí cố định: tick đã chi (chỉ ở chế độ Tháng) ──
  // Ngày chi mặc định = ngày tiền THẬT rời tài khoản theo lịch thường (VP: 05/M · nhân sự: 05/M+1).
  // Nhờ vậy khoản trả đúng hạn tick sau này vẫn nằm TRƯỚC ngày chốt sổ → không bị trừ dòng tiền lại.
  // Nếu trả TRỄ hơn lịch thường (VD: gộp trả nhiều tháng 1 lần sau ngày chốt sổ) → truyền customDate
  // là ngày thật đã chi, để dòng tiền trừ đúng lúc tiền thật sự rời quỹ.
  async function toggleFixedPaid(itemName: string, amount: number, paid: boolean, source: string, group: 'co_dinh' | 'nhan_su', customDate?: string) {
    if (paid) {
      await supabase.from('fixed_cost_payments').upsert({
        month, year, item_name: itemName, amount,
        source_channel: source, paid_date: customDate || fixedPayDate(group, month, year), created_by: userId,
      }, { onConflict: 'month,year,item_name' })
    } else {
      await supabase.from('fixed_cost_payments').delete()
        .eq('month', month).eq('year', year).eq('item_name', itemName)
    }
    router.refresh()
  }
  async function setFixedSource(itemName: string, source: string) {
    await supabase.from('fixed_cost_payments').update({ source_channel: source })
      .eq('month', month).eq('year', year).eq('item_name', itemName)
    router.refresh()
  }
  async function setFixedDate(itemName: string, date: string) {
    await supabase.from('fixed_cost_payments').update({ paid_date: date })
      .eq('month', month).eq('year', year).eq('item_name', itemName)
    router.refresh()
  }

  // ── Ghi từng lần đóng BHXH / TNCN / VAT bù ──
  async function handleTaxSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const { error } = await supabase.from('tax_payments').insert({
      kind: taxKind,
      amount: parseInt(form.get('amount') as string || '0', 10),
      paid_date: (form.get('paid_date') as string) || defaultDate,
      source_channel: (form.get('source_channel') as string) || 'tk_cty',
      note: form.get('note') as string || null,
      for_month: parseInt(form.get('for_month') as string || String(toMonth), 10),
      for_year: parseInt(form.get('for_year') as string || String(year), 10),
      created_by: userId,
    })
    setLoading(false)
    if (error) {
      alert('Lỗi khi lưu:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
      return
    }
    setTaxKind(null); router.refresh()
  }
  async function deleteTax(id: string) {
    if (!confirm('Xóa lần đóng này?')) return
    const { error } = await supabase.from('tax_payments').delete().eq('id', id)
    if (error) { alert('Lỗi khi xóa:\n' + (error.message ?? '')); return }
    router.refresh()
  }

  // "Đã đóng" phải khớp đúng kỳ ghi nhận (for_month/for_year) — KHÔNG phải ngày nộp thật (paid_date).
  // Khoản cũ chưa có for_month/for_year (trước 2026-08) → tạm suy ra từ paid_date để không biến mất khỏi mọi kỳ.
  const inTaxPeriod = (p: TaxPayment) => {
    const m = p.for_month ?? Number(p.paid_date.slice(5, 7))
    const y = p.for_year ?? Number(p.paid_date.slice(0, 4))
    return y === year && m >= fromMonth && m <= toMonth
  }
  const bhxhPays = taxPayments.filter(p => p.kind === 'bhxh' && inTaxPeriod(p))
  const tncnPays = taxPayments.filter(p => p.kind === 'tncn' && inTaxPeriod(p))
  const vatPays = taxPayments.filter(p => p.kind === 'vat' && inTaxPeriod(p))
  const sumC = (a: OperatingCost[]) => a.reduce((s, c) => s + c.amount, 0)
  const nhanSuTotal = payrollTN1 + payrollTN2 + fixedNhanSu.reduce((s, i) => s + i.amount, 0) + sumC(designFreelance)
  const periodLabel = period === 'thang' ? `${MONTH_VN[month]} ${year}` : period === 'quy' ? `Quý ${quarter} · ${year}` : `Năm ${year}`

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Vận hành công ty</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tuyệt mật — chỉ CEO xem được</p>
        </div>
        <button onClick={() => exportFullSystemToExcel(backupData)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900">
          <Download size={14} /> Xuất backup toàn hệ thống
        </button>
      </div>

      {/* ── Bộ lọc kỳ ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
          {[['thang','Tháng'],['quy','Quý'],['nam','Năm']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)}
              className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{l}</button>
          ))}
        </div>
        {period === 'thang' && (
          <select value={month} onChange={e => setValue('month', e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
            {MONTH_VN.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        )}
        {period === 'quy' && (
          <select value={quarter} onChange={e => setValue('quarter', e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
            {[1,2,3,4].map(q => <option key={q} value={q}>Quý {q}</option>)}
          </select>
        )}
        <select value={year} onChange={e => setValue('year', e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          {[year-1, year, year+1].map(y => <option key={y} value={y}>Năm {y}</option>)}
        </select>
      </div>

      {/* ── 3 ô tổng ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-xs text-gray-500 mb-1">
            Doanh thu (gồm VAT) — {completedProjects.length} công trình nghiệm thu
          </p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{formatVND(doanhThuTong)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
            đã thu {formatVND(doanhThuDaThu)} · chưa thu {formatVND(doanhThuTong - doanhThuDaThu)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Số thuần (đã trừ VAT, dùng tính lợi nhuận) xem bảng bên dưới
          </p>
        </div>
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-xs text-gray-500 mb-1">Chi phí vận hành</p>
          <p className="text-xl font-bold text-red-600 tabular-nums">{formatVND(chiPhiVanHanh)}</p>
        </div>
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-xs text-gray-500 mb-1">Lợi nhuận thực tế</p>
          <p className={`text-xl font-bold tabular-nums ${profitTable.loiNhuan >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatVND(profitTable.loiNhuan)}
          </p>
        </div>
      </div>

      {/* ── Bảng chi phí vận hành ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-900 flex items-center justify-between">
          <span className="text-sm font-bold text-white uppercase tracking-wide">Chi phí vận hành — {periodLabel}</span>
          <span className="text-base font-bold text-white tabular-nums">{formatVND(chiPhiVanHanh)}</span>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-50">

            <GroupRow label="Chi phí cố định" value={fixedCoDinh.reduce((s,i)=>s+i.amount,0)} />
            {fixedCoDinh.map(item => (
              <FixedRow key={item.name} item={item} isMonth={isMonth} month={month} year={year}
                closingDate={chotSo?.closing_date ?? null}
                payments={fixedPayments} onToggle={toggleFixedPaid} onSource={setFixedSource} onDate={setFixedDate} />
            ))}

            <GroupRow label="Chi phí nhân sự" value={nhanSuTotal}
              onAdd={() => { setEditing(null); setAddType('design_freelance') }} addLabel="Thiết kế Freelancer" />
            <SubRow label="Thực nhận (1) — Chuyển khoản" note="tự động từ bảng lương · TK Công ty" value={payrollTN1} color="text-green-700" />
            <SubRow label="Thực nhận (2) — Tiền mặt / CKCN" note="tự động từ bảng lương · TK Cá nhân" value={payrollTN2} color="text-orange-600" />
            {fixedNhanSu.map(item => (
              <FixedRow key={item.name} item={item} isMonth={isMonth} month={month} year={year}
                closingDate={chotSo?.closing_date ?? null}
                payments={fixedPayments} onToggle={toggleFixedPaid} onSource={setFixedSource} onDate={setFixedDate} />
            ))}
            {designFreelance.map(c => (
              <CostRow key={c.id} c={c} onEdit={setEditing} onDelete={handleDelete} />
            ))}

            <GroupRow label="BHXH Công ty" value={bhxhTotal} />
            <SubRow label={`BHXH nhân viên (NV ${formatVNDShort(payrollBhxhNLD)} + CTY ${formatVNDShort(payrollBhxhCTY)})`}
              note="tự động từ bảng lương · công ty nộp cả 2 phần" value={payrollBhxhNLD + payrollBhxhCTY} color="text-red-600" />
            {ceoBhxh > 0 && (
              <SubRow label="BHXH CEO" note="1 triệu/tháng · từ T1/2026 · kế toán thuế chi hộ theo đợt 6 tháng"
                value={ceoBhxh} color="text-red-600" />
            )}

            <GroupRow label="Chạy ADS / quảng cáo" value={sumC(adsCosts)}
              onAdd={() => { setEditing(null); setAddType('ads') }} />
            {adsCosts.length === 0
              ? <EmptyRow text="Chưa có khoản ADS nào." />
              : adsCosts.map(c => <CostRow key={c.id} c={c} onEdit={setEditing} onDelete={handleDelete} />)}

            <GroupRow label="Phí khác" value={sumC(otherCosts)}
              onAdd={() => { setEditing(null); setAddType('other') }} />
            {otherCosts.length === 0
              ? <EmptyRow text="Chưa có khoản phát sinh nào." />
              : otherCosts.map(c => <CostRow key={c.id} c={c} onEdit={setEditing} onDelete={handleDelete} />)}

            <tr className="bg-amber-50/60">
              <td colSpan={2} className="px-5 py-2 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Thuế đóng NN của công trình
                <span className="ml-2 text-[10px] font-normal normal-case text-amber-600">
                  chỉ theo dõi — không cộng vào chi phí
                </span>
              </td>
              <td className="px-5 py-2 text-right text-xs font-bold text-amber-700 tabular-nums">{formatVND(tncnThauPhu + thueBu)}</td>
            </tr>
            <SubRow label="TNCN đóng cho thầu phụ" note="đã nằm trong giá vốn nhân công" value={tncnThauPhu} color="text-amber-700" />
            <SubRow label="Thuế bù (VAT phải nộp bù)"
              note={
                vatMethod === 'invoice'
                  ? `VAT đầu ra ${formatVNDShort(vatDauRa)} − đầu vào ${formatVNDShort(vatDauVao)} · theo ngày hóa đơn thực tế (khớp trang Kiểm Soát Hóa Đơn) — số chính thức để nộp thuế`
                  : `VAT đầu ra ${formatVNDShort(vatDauRa)} − đầu vào ${formatVNDShort(vatDauVao)} · theo công trình nghiệm thu (Q1/2026 trở về trước, đã chốt) — không dùng để đối chiếu tờ khai`
              }
              value={thueBu} color="text-amber-700" />
          </tbody>
        </table>
      </div>

      {/* ── 4 ô pastel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TaxCard title="BHXH Công ty" total={bhxhTotal} pays={bhxhPays}
          cls="bg-amber-50 border-amber-200" titleCls="text-amber-800"
          onAdd={() => setTaxKind('bhxh')} onDelete={deleteTax} />
        <TaxCard title="TNCN thầu phụ" total={tncnThauPhu} pays={tncnPays}
          cls="bg-blue-50 border-blue-200" titleCls="text-blue-800"
          onAdd={() => setTaxKind('tncn')} onDelete={deleteTax} />
        <TaxCard title="VAT phải nộp bù"
          subtitle={vatMethod === 'invoice' ? 'Theo Kiểm Soát Hóa Đơn (ngày hóa đơn) — số chính thức' : 'Theo công trình nghiệm thu — Q1/2026 trở về trước, đã chốt'}
          total={thueBu} pays={vatPays}
          cls="bg-purple-50 border-purple-200" titleCls="text-purple-800"
          onAdd={() => setTaxKind('vat')} onDelete={deleteTax} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-green-200">
            <h2 className="font-semibold text-green-800 text-sm">Lợi nhuận thực tế — {periodLabel}</h2>
            <p className="text-[11px] text-green-700/70 mt-0.5">
              Chỉ tính công trình đã NGHIỆM THU trong kỳ — doanh thu và giá vốn đi cùng nhau
            </p>
          </div>
          {completedProjects.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-gray-500">Chưa có công trình nào nghiệm thu trong kỳ này.</p>
              <p className="text-xs text-gray-400 mt-1">
                Công trình xong nhớ đánh dấu <strong>Hoàn thành</strong> + điền <strong>ngày kết thúc</strong> thì mới ghi nhận doanh thu.
              </p>
            </div>
          ) : (
            <>
              <div className="px-5 py-2 bg-green-100/40 border-b border-green-200">
                <p className="text-[11px] text-green-800">
                  Nghiệm thu: {completedProjects.map(p => p.name).join(' · ')}
                </p>
              </div>
              <div>
                <FinRow label="Doanh thu HĐ VAT (thuần, ÷1.08)" value={profitTable.doanhThuVatNet} sign="+" />
                <FinRow label="Doanh thu HĐ không VAT" value={profitTable.doanhThuKhongVat} sign="+" />
                <FinRow label="Giá vốn HĐ VAT (vật tư net + NC)" value={profitTable.chiPhiHdVat} sign="−" />
                <FinRow label="Giá vốn HĐ không VAT" value={profitTable.chiPhiHdKhongVat} sign="−" />
              </div>
              <div className="px-5 py-2 bg-green-100/40 border-y border-green-200 flex items-center justify-between">
                <span className="text-xs font-medium text-green-800">= Lãi gộp công trình</span>
                <span className={`text-sm font-bold tabular-nums ${profitTable.laiGop >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {formatVND(profitTable.laiGop)}
                </span>
              </div>
              <FinRow label="Chi phí vận hành trong kỳ" value={profitTable.chiPhiVanHanh} sign="−" />
            </>
          )}
          <div className="px-5 py-3 bg-green-100/60 border-t border-green-200 flex items-center justify-between">
            <span className="text-sm font-bold text-green-900">= Lợi nhuận thực tế</span>
            <span className={`text-lg font-black tabular-nums ${profitTable.loiNhuan >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatVND(profitTable.loiNhuan)}
            </span>
          </div>
          {profitTable.chiPhiDoDang > 0 && (
            <div className="px-5 py-2.5 bg-white border-t border-green-200 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Chi phí dở dang — {wipCount} công trình đang chạy
                <span className="text-gray-400"> · chưa trừ lợi nhuận</span>
              </span>
              <span className="text-sm font-semibold text-gray-600 tabular-nums">{formatVND(profitTable.chiPhiDoDang)}</span>
            </div>
          )}
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-orange-200">
            <h2 className="font-semibold text-orange-800 text-sm">Cơ sở thuế TNDN 17% — {periodLabel}</h2>
          </div>
          <div>
            <FinRow label="Doanh thu HĐ VAT (thuần, đã ÷1.08)" value={taxTable.doanhThuVatNet} sign="+" />
            <FinRow label="Chi phí vật tư (đã trừ VAT)" value={taxTable.chiPhiVatTu} sign="−" />
            <FinRow label="Chi phí nhân công (gốc + 10% TNCN)" value={taxTable.chiPhiNhanCong} sign="−" />
            <FinRow label="Chi phí vận hành hợp lệ" value={taxTable.chiPhiVanHanh} sign="−" />
            <FinRow label="BHXH nhân sự" value={taxTable.bhxh} sign="−" />
          </div>
          <div className="px-5 py-2 bg-orange-100/40 border-t border-orange-200 flex items-center justify-between">
            <span className="text-xs font-medium text-orange-800">= Cơ sở tính thuế</span>
            <span className={`text-sm font-bold tabular-nums ${taxTable.coSo >= 0 ? 'text-orange-900' : 'text-green-700'}`}>
              {formatVND(taxTable.coSo)}
            </span>
          </div>
          <div className="px-5 py-3 bg-orange-200/50 border-t border-orange-300 flex items-center justify-between">
            <span className="text-sm font-bold text-orange-900">TNDN = 17% × Cơ sở</span>
            <span className="text-lg font-black text-orange-900 tabular-nums">{formatVNDShort(taxTable.tndn)}</span>
          </div>
        </div>
      </div>

      {/* ── Dòng tiền + Chốt sổ (giữ nguyên) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-end gap-2">
          <CashflowHistoryModal />
          <CashflowAsOfModal />
          <ChotSoButton initial={chotSo} />
        </div>
        <CashflowBox cashflow={cashflow} />
        <ChuyenTienPanel initial={transfers} />
        <SiteAdvancePanel initial={siteAdvances} />
      </div>

      {/* ── Chi tiêu cá nhân (giữ nguyên) ── */}
      <div>
        <div className="flex border-b border-gray-200 mb-4">
          <span className="px-5 py-2.5 text-sm font-medium border-b-2 border-blue-500 text-blue-600">Chi tiêu cá nhân</span>
        </div>
        <PersonalExpensesTab initialExpenses={personalExpenses} initialLoans={personalLoans} initialDeposits={channelDeposits} />
      </div>

      {/* ── Modal chi phí phát sinh ── */}
      {(addType || editing) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? 'Sửa chi phí' : 'Thêm chi phí'}</h2>
              <button onClick={() => { setAddType(null); setEditing(null) }} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form key={editing?.id ?? addType ?? 'new'} onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Loại chi phí</label>
                <select name="cost_type" required defaultValue={editing?.cost_type ?? addType ?? 'other'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mô tả <span className="text-red-500">*</span></label>
                  <input name="description" required defaultValue={editing?.description ?? ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ngày chi</label>
                  <input name="spent_date" type="date" defaultValue={editing?.spent_date?.slice(0,10) ?? defaultDate}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND) <span className="text-red-500">*</span></label>
                  <input name="amount" type="number" required min="0" defaultValue={editing?.amount ?? ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nguồn tiền thanh toán</label>
                  <select name="source_channel" defaultValue={editing?.source_channel ?? ((editing?.cost_type ?? addType) === 'design_freelance' ? 'tk_cn' : 'tk_cty')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {SOURCE_CHANNELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Loại VAT</label>
                  <select name="vat_rate" defaultValue={editing?.vat_rate ?? 'no_vat'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="no_vat">Không VAT</option>
                    <option value="vat_10">VAT 10%</option>
                    <option value="vat_8">VAT 8%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tính khấu trừ thuế TNDN</label>
                  <select name="tax_type" defaultValue={editing?.tax_type ?? 'non_deductible'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="non_deductible">Không khấu trừ</option>
                    <option value="deductible_vat">Có VAT — được khấu trừ</option>
                    <option value="deductible_no_vat">Không VAT — được khấu trừ</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ghi chú {(editing?.cost_type ?? addType) === 'design_freelance' && <span className="text-gray-400 font-normal">— ghi rõ công trình</span>}
                </label>
                <input name="note" defaultValue={editing?.note ?? ''} placeholder="VD: CT Trần Não"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => { setAddType(null); setEditing(null) }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
                  {loading ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal ghi lần đóng BHXH / TNCN / VAT bù ── */}
      {taxKind && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                Ghi lần {taxKind === 'bhxh' ? 'đóng BHXH' : taxKind === 'tncn' ? 'nộp TNCN thầu phụ' : 'nộp VAT bù'}
              </h2>
              <button onClick={() => setTaxKind(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleTaxSubmit} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền <span className="text-red-500">*</span></label>
                  <input name="amount" type="number" required min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ngày nộp thật (dòng tiền)</label>
                  <input name="paid_date" type="date" defaultValue={defaultDate}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-gray-500">
                  Kỳ ghi nhận — khoản này thuộc kỳ nào (dù nộp thật ở ngày khác cũng không đổi)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <select name="for_month" defaultValue={toMonth}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    {MONTH_VN.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                  <input name="for_year" type="number" defaultValue={year}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nguồn tiền</label>
                <select name="source_channel" defaultValue="tk_cty"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {SOURCE_CHANNELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
                <input name="note" placeholder={taxKind === 'bhxh' ? 'VD: BHXH quý 3/2026' : taxKind === 'tncn' ? 'VD: TNCN thợ sơn' : 'VD: VAT bù Quý 1/2026'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setTaxKind(null)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
                  {loading ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupRow({ label, value, onAdd, addLabel }: {
  label: string; value: number; onAdd?: () => void; addLabel?: string
}) {
  return (
    <tr className="bg-gray-50/70">
      <td colSpan={2} className="px-5 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <div className="flex items-center gap-2">
          {label}
          {onAdd && (
            <button onClick={onAdd}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 normal-case">
              <Plus size={11} /> Thêm{addLabel ? ` ${addLabel}` : ''}
            </button>
          )}
        </div>
      </td>
      <td className="px-5 py-2 text-right text-xs font-bold text-gray-700 tabular-nums">{formatVND(value)}</td>
    </tr>
  )
}

function SubRow({ label, note, value, color = 'text-gray-900' }: {
  label: string; note?: string; value: number; color?: string
}) {
  return (
    <tr className="hover:bg-gray-50/50">
      <td className="px-5 py-3 pl-8 text-gray-800 text-sm">{label}</td>
      <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell">{note ?? ''}</td>
      <td className={`px-5 py-3 text-right font-medium tabular-nums text-sm ${color}`}>{formatVND(value)}</td>
    </tr>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <tr><td colSpan={3} className="px-5 py-3 text-xs text-gray-400 text-center italic">{text}</td></tr>
}

function FixedRow({ item, isMonth, month, year, closingDate, payments, onToggle, onSource, onDate }: {
  item: FixedRangeItem
  isMonth: boolean
  month: number
  year: number
  closingDate: string | null
  payments: FixedPayment[]
  onToggle: (name: string, amount: number, paid: boolean, source: string, group: 'co_dinh' | 'nhan_su', customDate?: string) => void
  onSource: (name: string, source: string) => void
  onDate: (name: string, date: string) => void
}) {
  const mine = payments.filter(p => p.item_name === item.name && item.months.includes(p.month))
  const pay = mine[0]
  const paid = mine.length > 0
  const payDate = fixedPayDate(item.group, month, year)
  // Ngày thật đã lưu (có thể do CEO sửa tay vì trả trễ hơn lịch thường) — fallback về ngày công thức nếu chưa có.
  const effectiveDate = pay?.paid_date ?? payDate
  const [showDateEdit, setShowDateEdit] = useState(false)
  const [dateInput, setDateInput] = useState(effectiveDate)
  // Chi trước ngày chốt sổ → coi như đã nằm trong số dư đầu kỳ, KHÔNG trừ dòng tiền nữa dù đã tick
  const beforeClosing = closingDate != null && effectiveDate < closingDate
  const note = [item.note, isMonth ? `chi ${new Date(effectiveDate + 'T00:00:00').toLocaleDateString('vi-VN')}` : null]
    .filter(Boolean).join(' · ')

  function openDateEdit() {
    setDateInput(effectiveDate)
    setShowDateEdit(true)
  }
  function confirmDate() {
    if (paid) onDate(item.name, dateInput)
    else onToggle(item.name, item.amount, true, pay?.source_channel ?? 'tk_cty', item.group, dateInput)
    setShowDateEdit(false)
  }

  return (
    <tr className="hover:bg-gray-50/50">
      <td className="px-5 py-3 pl-8 text-gray-800 text-sm">{item.name}</td>
      <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell">
        {note}
        {isMonth && paid && (
          <button onClick={openDateEdit} className="ml-1.5 text-blue-500 hover:underline">(sửa ngày)</button>
        )}
        {isMonth && paid && beforeClosing && (
          <span className="block text-[10px] text-amber-600 mt-0.5">
            trước ngày chốt sổ ({new Date(closingDate! + 'T00:00:00').toLocaleDateString('vi-VN')}) — không trừ dòng tiền
          </span>
        )}
      </td>
      <td className="px-5 py-3">
        {showDateEdit ? (
          <div className="flex items-center justify-end gap-1.5">
            <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)}
              className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5" />
            <button onClick={confirmDate} className="text-[11px] px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700">Xác nhận</button>
            <button onClick={() => setShowDateEdit(false)} className="text-[11px] px-2 py-0.5 rounded text-gray-500 hover:bg-gray-100">Hủy</button>
          </div>
        ) : (
        <div className="flex items-center justify-end gap-2">
          {isMonth ? (
            <>
              {paid && (
                <select value={pay!.source_channel} onChange={e => onSource(item.name, e.target.value)}
                  className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
                  {SOURCE_CHANNELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
              <button
                onClick={() => paid ? onToggle(item.name, item.amount, false, pay?.source_channel ?? 'tk_cty', item.group) : openDateEdit()}
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                  paid ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>{paid ? '✓ Đã chi' : 'Chưa chi'}</button>
            </>
          ) : (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
              mine.length === item.months.length ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>{mine.length}/{item.months.length} tháng đã chi</span>
          )}
          <span className="font-medium tabular-nums text-sm text-gray-900 w-28 text-right">{formatVND(item.amount)}</span>
        </div>
        )}
      </td>
    </tr>
  )
}

function CostRow({ c, onEdit, onDelete }: {
  c: OperatingCost; onEdit: (c: OperatingCost) => void; onDelete: (id: string) => void
}) {
  return (
    <tr className="hover:bg-gray-50/50 group">
      <td className="px-5 py-3 pl-8 text-gray-800 text-sm">{c.description}</td>
      <td className="px-5 py-3 text-gray-400 text-xs hidden md:table-cell">
        {[
          c.spent_date ? new Date(c.spent_date + 'T00:00:00').toLocaleDateString('vi-VN') : null,
          c.source_channel ? CHANNEL_LABEL[c.source_channel] : null,
          c.note,
        ].filter(Boolean).join(' · ')}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-2">
          <span className="font-medium tabular-nums text-sm text-gray-900">{formatVND(c.amount)}</span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(c)} className="p-1 text-gray-300 hover:text-blue-600 rounded" title="Sửa"><Pencil size={13} /></button>
            <button onClick={() => onDelete(c.id)} className="p-1 text-gray-300 hover:text-red-500 rounded" title="Xóa"><Trash2 size={13} /></button>
          </div>
        </div>
      </td>
    </tr>
  )
}

function TaxCard({ title, subtitle, total, pays, cls, titleCls, onAdd, onDelete }: {
  title: string; subtitle?: string; total: number; pays: TaxPayment[]; cls: string; titleCls: string
  onAdd: () => void; onDelete: (id: string) => void
}) {
  const paid = pays.reduce((s, p) => s + p.amount, 0)
  const left = total - paid
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-semibold ${titleCls}`}>{title}</span>
        <button onClick={onAdd} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-white/70 border border-gray-200 rounded-lg hover:bg-white">
          <Plus size={11} /> Ghi lần đóng
        </button>
      </div>
      <p className="text-[10px] text-gray-500 mb-2 min-h-[14px]">{subtitle}</p>
      <div className="flex gap-5 text-xs">
        <div><p className="text-gray-500">Phải đóng</p><p className="font-bold text-gray-900 tabular-nums">{formatVND(total)}</p></div>
        <div><p className="text-gray-500">Đã đóng</p><p className="font-bold text-green-700 tabular-nums">{formatVND(paid)}</p></div>
        <div><p className="text-gray-500">Còn nợ</p>
          <p className={`font-bold tabular-nums ${left > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatVND(Math.max(0, left))}</p></div>
      </div>
      <div className="mt-3 space-y-0">
        {pays.length === 0 ? (
          <p className="text-xs text-gray-400 italic pt-2 border-t border-gray-200/60">Chưa ghi lần đóng nào.</p>
        ) : pays.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 border-t border-gray-200/60 text-xs group">
            <div className="text-gray-600 min-w-0">
              {new Date(p.paid_date + 'T00:00:00').toLocaleDateString('vi-VN')}
              {p.note && <span> · {p.note}</span>}
              <p className="text-gray-400 text-[11px]">{CHANNEL_LABEL[p.source_channel] ?? p.source_channel}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="font-semibold tabular-nums text-gray-900">{formatVND(p.amount)}</span>
              <button onClick={() => onDelete(p.id)}
                className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinRow({ label, value, sign }: { label: string; value: number; sign: '+' | '−' }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-black/5 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm tabular-nums font-medium ${sign === '+' ? 'text-gray-900' : 'text-red-600'}`}>
        {sign === '−' ? '−' : ''}{formatVND(value)}
      </span>
    </div>
  )
}
