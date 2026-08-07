'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Users, Image } from 'lucide-react'
import {
  Employee, PayrollEntry, calcPayroll, EMPTY_ENTRY,
  calcChuanCong, GIAM_TRU_CA_NHAN, GIAM_TRU_PHU_THUOC,
  calcLeaveAccrued, PROBATION_FACTOR, effectiveBaseSalary,
} from './calc'
import { formatVND } from '@/lib/utils'
import PayslipCard from './PayslipCard'

const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

interface Props {
  employee: Employee
  entry: PayrollEntry | null
  month: number
  year: number
  userId: string
  advance?: { ck: number; tm: number }   // đã ứng lương tháng này: ck=TK CTY (trừ TN1), tm=TM/TK CN (trừ TN2)
  onClose: () => void
}

function Num({ label, value, color }: {
  label: string
  value: number
  color?: 'green' | 'blue' | 'orange'
}) {
  const bg = color === 'green'  ? 'bg-green-50 border border-green-200'
    : color === 'blue'   ? 'bg-blue-50 border border-blue-200'
    : color === 'orange' ? 'bg-orange-50 border border-orange-200'
    : 'bg-gray-50'
  const textCls = color === 'green'  ? 'text-green-700 font-bold'
    : color === 'blue'   ? 'text-blue-700 font-bold'
    : color === 'orange' ? 'text-orange-600 font-semibold'
    : 'text-gray-800'
  return (
    <div className={`rounded-lg p-2.5 ${bg}`}>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm tabular-nums ${textCls}`}>{formatVND(value)}</p>
    </div>
  )
}

function NumField({ label, name, value, onChange, step = '1', suffix }: {
  label: string
  name: keyof PayrollEntry
  value: number
  onChange: (k: keyof PayrollEntry, v: string) => void
  step?: string
  suffix?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step={step}
          min="0"
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={e => onChange(name, e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
        />
        {suffix && (
          <span className="absolute right-9 top-2 text-xs text-gray-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export default function EditPayrollModal({ employee, entry, month, year, userId, advance, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState<Partial<PayrollEntry>>(
    entry ?? EMPTY_ENTRY(employee.id, month, year)
  )
  const slipRef = useRef<HTMLDivElement>(null)

  const result = calcPayroll(employee, form, month, year)
  const adv = advance ?? { ck: 0, tm: 0 }
  const daUng = adv.ck + adv.tm
  const isThuViec = result.isProbation
  const isFullSalary = (employee.salary_type ?? 'proportional') === 'full'
  const dependents = employee.dependents ?? 0
  const totalGiamTru = GIAM_TRU_CA_NHAN + dependents * GIAM_TRU_PHU_THUOC
  const chuanCong = calcChuanCong(month, year, employee.dept, employee.work_days)
  const autoGiuXe = result.autoGiuXe

  // Entry ĐÃ tồn tại (có id) sẽ khóa base_salary_snap tại thời điểm tạo — nếu sau đó Sếp xác nhận
  // tăng lương áp dụng ngược lại đúng tháng này, entry cũ không tự cập nhật theo (đúng thiết kế
  // snapshot, nhưng cần 1 lối để làm mới thủ công khi cần) — CEO chốt 2026-08-05.
  const currentEffectiveSalary = effectiveBaseSalary(employee, month, year)
  const snapMismatch = !!entry?.id && form.base_salary_snap != null && form.base_salary_snap !== currentEffectiveSalary
  const [refreshingSnap, setRefreshingSnap] = useState(false)

  async function refreshSalarySnap() {
    if (!entry?.id) return
    setRefreshingSnap(true)
    const { error } = await supabase.from('payroll_entries')
      .update({ base_salary_snap: currentEffectiveSalary, updated_at: new Date().toISOString() })
      .eq('id', entry.id)
    setRefreshingSnap(false)
    if (error) { alert(`Lỗi: ${error.message}`); return }
    setForm(prev => ({ ...prev, base_salary_snap: currentEffectiveSalary }))
    router.refresh()
  }

  // Phép năm: tích lũy − đã nghỉ (tổng năm)
  const [usedLeaveOther, setUsedLeaveOther] = useState(0)
  useEffect(() => {
    let active = true
    supabase.from('payroll_entries')
      .select('ngay_nghi_phep')
      .eq('employee_id', employee.id).eq('year', year).neq('month', month)
      .then(({ data }) => {
        if (!active) return
        setUsedLeaveOther((data ?? []).reduce((s, e) => s + (e.ngay_nghi_phep ?? 0), 0))
      })
    return () => { active = false }
  }, [employee.id, month, year, supabase])

  const leaveAccrued = calcLeaveAccrued(employee, month, year)
  const leaveUsedTotal = usedLeaveOther + (form.ngay_nghi_phep ?? 0)
  const leaveRemaining = leaveAccrued - leaveUsedTotal

  async function handleExportImage() {
    if (!slipRef.current) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(slipRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f1f5f9',
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `phieu-luong-${employee.msnv ?? employee.name}-T${month}-${year}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setExporting(false)
    }
  }

  function setNum(key: keyof PayrollEntry, value: string) {
    setForm(prev => ({ ...prev, [key]: parseFloat(value) || 0 }))
  }

  function setText(key: keyof PayrollEntry, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const basePayload = {
      employee_id:       employee.id,
      month, year,
      actual_days:       form.actual_days       ?? 0,
      overtime_hours:    form.overtime_hours    ?? 0,
      overtime_hours_le: form.overtime_hours_le ?? 0,
      overtime_note:     form.overtime_note     ?? null,
      pc_grab:           form.pc_grab           ?? 0,
      kpi_bonus:         form.kpi_bonus         ?? 0,
      hoa_hong:          form.hoa_hong          ?? 0,
      hoa_hong_note:     form.hoa_hong_note     ?? null,
      pc_giuxe:          result.pcGiuXe,
      pc_dict:           form.pc_dict           ?? 0,
      pc_khac:           form.pc_khac           ?? 0,
      pc_khac_note:      form.pc_khac_note      ?? null,
      ngay_nghi_phep:    form.ngay_nghi_phep    ?? 0,
      ngay_nghi_ghi_chu: form.ngay_nghi_ghi_chu ?? '',
      note:              form.note              ?? '',
      created_by:        userId,
      updated_at:        new Date().toISOString(),
    }

    let error
    if (entry?.id) {
      // Cập nhật: giữ nguyên snapshot gốc (không ghi đè trạng thái hiện tại)
      ;({ error } = await supabase.from('payroll_entries').update(basePayload).eq('id', entry.id))
    } else {
      // Tạo mới: snapshot trạng thái nhân viên tại thời điểm nhập lương
      const payload = {
        ...basePayload,
        employment_type_snap: employee.employment_type,
        salary_type_snap:     employee.salary_type,
        base_salary_snap:     effectiveBaseSalary(employee, month, year),
        bhxh_base_snap:       employee.bhxh_base,
      }
      ;({ error } = await supabase.from('payroll_entries').insert(payload))
    }

    if (!error) { router.refresh(); onClose() }
    else { alert('Lỗi khi lưu. Vui lòng thử lại.'); setLoading(false) }
  }

  const SectionTitle = ({ title, color }: { title: string; color: string }) => (
    <p className={`text-xs font-semibold uppercase tracking-wide mb-2.5 ${color}`}>{title}</p>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{employee.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {employee.title} · {employee.dept} ·{' '}
              <span className={result.isIntern ? 'text-purple-700 font-medium' : isThuViec ? 'text-orange-600 font-medium' : 'text-green-700 font-medium'}>
                {result.isIntern ? 'Thực tập sinh' : isThuViec ? 'Thử việc' : 'Chính thức'}
              </span>
              {' · '}{MONTH_VN[month]} {year}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 mt-0.5">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* ── Section 1: Ngày công ── */}
          <div>
            <SectionTitle title="Ngày công" color="text-blue-700" />

            {/* Trạng thái thực tập sinh / thử việc / chính thức của tháng */}
            {result.isIntern ? (
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mb-3 text-xs text-purple-700">
                <strong>Thực tập sinh</strong> — lương 100% × {formatVND(employee.base_salary)}. Không trừ BHXH. Toàn bộ chi qua <strong>Thực nhận (2)</strong>.
              </div>
            ) : result.isProbation ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3 text-xs text-orange-700">
                <strong>Thử việc tháng này</strong> — lương = 85% × {formatVND(employee.base_salary)} = <strong>{formatVND(Math.round(employee.base_salary * PROBATION_FACTOR))}</strong>. Không trừ BHXH.
                {employee.official_from_month
                  ? ` (mốc Chính thức: ${employee.official_from_month}/${employee.official_from_year})`
                  : <span className="text-orange-500"> — chưa có mốc &quot;Chính thức từ&quot; (cập nhật ở tab Nhân sự để tự chuyển sang chính thức).</span>}
              </div>
            ) : !result.bhxhStarted ? (
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mb-3 text-xs text-purple-700">
                <strong>Chính thức</strong> — lương 100%{employee.official_from_month ? ` (từ ${employee.official_from_month}/${employee.official_from_year})` : ''}.
                {' '}<strong>Chưa trừ BHXH</strong> — công ty chưa tới mốc đóng BHXH{employee.bhxh_from_month ? ` (từ ${employee.bhxh_from_month}/${employee.bhxh_from_year})` : ''}.
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 text-xs text-green-700">
                <strong>Chính thức</strong> — lương 100%{employee.official_from_month ? ` (từ ${employee.official_from_month}/${employee.official_from_year})` : ''}. Có trừ BHXH.
              </div>
            )}

            {snapMismatch && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800 flex items-center justify-between gap-3 flex-wrap">
                <span>
                  ⚠️ Bảng lương tháng này đang khóa mức lương cũ <strong>{formatVND(form.base_salary_snap ?? 0)}</strong>,
                  trong khi mức lương hiện áp dụng cho tháng {month}/{year} là <strong>{formatVND(currentEffectiveSalary)}</strong> (do tăng lương sau khi đã nhập ngày công).
                </span>
                <button
                  type="button"
                  onClick={refreshSalarySnap}
                  disabled={refreshingSnap}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:bg-amber-300 shrink-0"
                >
                  {refreshingSnap ? 'Đang cập nhật...' : `Cập nhật lại lương (${formatVND(currentEffectiveSalary)})`}
                </button>
              </div>
            )}

            {isFullSalary ? (
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 mb-3">
                <p className="text-xs text-purple-600 font-medium">Lương toàn tháng — không tính theo ngày công</p>
                <p className="text-lg font-bold text-purple-800 tabular-nums mt-0.5">
                  {formatVND(employee.base_salary)}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Công chuẩn {employee.work_days?.length ? '(lịch riêng)' : '(tự động)'}
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-right text-gray-500 tabular-nums">
                    {chuanCong} ngày
                  </div>
                </div>
                <NumField
                  label="Ngày công TT"
                  name="actual_days"
                  value={form.actual_days ?? 0}
                  onChange={setNum}
                  step="0.5"
                />
              </div>
            )}

            {!isFullSalary && (
              <div className="grid grid-cols-3 gap-3 mb-3">
                <NumField
                  label="Giờ tăng ca thường (x1)"
                  name="overtime_hours"
                  value={form.overtime_hours ?? 0}
                  onChange={setNum}
                  step="0.5"
                  suffix="h"
                />
                <NumField
                  label="Giờ tăng ca CN/Lễ (x1.5)"
                  name="overtime_hours_le"
                  value={form.overtime_hours_le ?? 0}
                  onChange={setNum}
                  step="0.5"
                  suffix="h"
                />
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ghi rõ ngày tăng ca</label>
                  <input
                    type="text"
                    value={form.overtime_note ?? ''}
                    onChange={e => setText('overtime_note', e.target.value)}
                    placeholder="VD: 5/7 (thường), 6/7 (CN)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Leave days — shown for all employees */}
            <div className="grid grid-cols-3 gap-3">
              <NumField
                label="Ngày nghỉ phép"
                name="ngay_nghi_phep"
                value={form.ngay_nghi_phep ?? 0}
                onChange={setNum}
                step="0.5"
              />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ghi rõ ngày nghỉ
                </label>
                <input
                  type="text"
                  value={form.ngay_nghi_ghi_chu ?? ''}
                  onChange={e => setText('ngay_nghi_ghi_chu', e.target.value)}
                  placeholder="VD: 15/6, 20/6"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Phép năm còn lại */}
            <div className="text-[11px] text-gray-500 mt-2">
              Phép năm: tích lũy <strong>{leaveAccrued}</strong> · đã nghỉ <strong>{leaveUsedTotal}</strong> · còn lại{' '}
              <strong className={leaveRemaining < 0 ? 'text-red-600' : 'text-green-700'}>{leaveRemaining}</strong> ngày
              {!employee.start_month && <span className="text-orange-500"> · chưa có ngày vào làm (cập nhật ở tab Nhân sự)</span>}
            </div>
          </div>

          {/* ── Section 2: Phụ cấp & thưởng (CKCN) ── */}
          <div>
            <SectionTitle title="Phụ cấp & Thưởng (CKCN)" color="text-orange-600" />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  PC Giữ xe {form.pc_giuxe == null && <span className="text-gray-400 font-normal">(tự động)</span>}
                </label>
                <input
                  type="number" min="0" step="1000"
                  value={form.pc_giuxe != null ? form.pc_giuxe : autoGiuXe}
                  onChange={e => setForm(prev => ({ ...prev, pc_giuxe: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {form.pc_giuxe != null && form.pc_giuxe !== autoGiuXe && (
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, pc_giuxe: null }))}
                    className="text-[10px] text-blue-500 mt-0.5 hover:underline">↺ tự động ({formatVND(autoGiuXe)})</button>
                )}
              </div>
              <NumField label="PC Đi CT"    name="pc_dict"    value={form.pc_dict    ?? 0} onChange={setNum} />
              {employee.grab_eligible && (
                <NumField label="PC Grab"   name="pc_grab"    value={form.pc_grab    ?? 0} onChange={setNum} />
              )}
              {employee.hoa_hong_rate <= 0 && (
                <NumField label="KPI / Thưởng" name="kpi_bonus" value={form.kpi_bonus ?? 0} onChange={setNum} />
              )}
              {employee.hoa_hong_rate > 0 && (
                <NumField
                  label="KPI CT"
                  name="hoa_hong"
                  value={form.hoa_hong ?? 0}
                  onChange={setNum}
                />
              )}
            </div>

            {employee.hoa_hong_rate > 0 && (form.hoa_hong ?? 0) > 0 && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú KPI CT (công trình được trích)</label>
                <textarea
                  rows={2}
                  value={form.hoa_hong_note ?? ''}
                  onChange={e => setText('hoa_hong_note', e.target.value)}
                  placeholder="VD: Văn phòng Vado: 2.739.863đ"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
            )}

            {/* PC Khác — số tiền + ghi chú cạnh nhau, luôn hiện */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">PC Khác</label>
                <input
                  type="number" min="0" step="1000"
                  value={form.pc_khac ? form.pc_khac : ''}
                  placeholder="0"
                  onChange={e => setForm(prev => ({ ...prev, pc_khac: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Nội dung PC Khác</label>
                <input
                  type="text"
                  value={form.pc_khac_note ?? ''}
                  onChange={e => setText('pc_khac_note', e.target.value)}
                  placeholder="VD: mua nước, ship hàng, mua đồ văn phòng..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* ── Giảm trừ gia cảnh info ── */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-2.5 flex items-start gap-2.5">
            <Users size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              <span className="font-semibold">Giảm trừ gia cảnh (NQ 110/2025):</span>{' '}
              {dependents === 0
                ? 'Không có người phụ thuộc.'
                : `${dependents} người phụ thuộc.`}
              {' '}Giảm trừ:{' '}
              <span className="font-semibold tabular-nums">{formatVND(totalGiamTru)}/tháng</span>
              {dependents > 0 && (
                <span className="text-blue-500"> (15,5M + {dependents} × 6,2M)</span>
              )}
            </p>
          </div>

          {/* ── Ghi chú ── */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
            <input
              value={form.note ?? ''}
              onChange={e => setText('note', e.target.value)}
              placeholder="Ghi chú thêm..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* ── Kết quả tính toán ── */}
          <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Kết quả tính toán (tự động)
            </p>

            <div className="grid grid-cols-3 gap-2 mb-2">
              <Num label="TN ngày công"  value={result.tnNgayCong} />
              <Num
                label={result.tienTCLe > 0 ? `Tiền tăng ca (${formatVND(result.tienTCThuong)} thường + ${formatVND(result.tienTCLe)} CN/Lễ)` : 'Tiền tăng ca'}
                value={result.tienTC}
              />
              <Num label="TN trước thuế" value={result.tnTruocThue} />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              <Num label="BHXH NLĐ (10.5%)" value={result.bhxhNLD} />
              <Num
                label={`Giảm trừ${dependents > 0 ? ` (${dependents} NPT)` : ' (cá nhân)'}`}
                value={result.giamTruTotal}
              />
              <Num label="Thuế TNCN" value={result.thueNCN} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Num label="✅ THỰC NHẬN (1)" value={result.thucNhan1}    color="green" />
              <Num label="THỰC NHẬN (2)"    value={result.thucNhan2}    color="orange" />
              <Num label="TỔNG THỰC NHẬN"   value={result.tongThucNhan} color="blue" />
            </div>

            {/* Ứng lương trong tháng — ck trừ TN1, tm trừ TN2 */}
            {daUng > 0 && (
              <div className="mt-3 border-t border-dashed border-green-200 pt-3">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
                  Ứng lương trong tháng
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg p-2.5 bg-green-50 border border-green-200">
                    <p className="text-xs text-gray-500 mb-0.5">Ứng TK CTY (trừ TN1)</p>
                    <p className="text-sm tabular-nums font-semibold text-green-700">
                      {adv.ck > 0 ? `−${formatVND(adv.ck)}` : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg p-2.5 bg-orange-50 border border-orange-200">
                    <p className="text-xs text-gray-500 mb-0.5">Ứng TM/CN (trừ TN2)</p>
                    <p className="text-sm tabular-nums font-semibold text-orange-600">
                      {adv.tm > 0 ? `−${formatVND(adv.tm)}` : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg p-2.5 bg-indigo-50 border border-indigo-200">
                    <p className="text-xs text-gray-500 mb-0.5">CÒN PHẢI TRẢ</p>
                    <p className={`text-sm tabular-nums font-bold ${result.tongThucNhan - daUng < 0 ? 'text-red-600' : 'text-indigo-700'}`}>
                      {formatVND(result.tongThucNhan - daUng)}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 tabular-nums">
                  Còn trả CK: <strong className={result.thucNhan1 - adv.ck < 0 ? 'text-red-600' : 'text-green-700'}>{formatVND(result.thucNhan1 - adv.ck)}</strong>
                  {' · '}Còn trả TM: <strong className={result.thucNhan2 - adv.tm < 0 ? 'text-red-600' : 'text-orange-600'}>{formatVND(result.thucNhan2 - adv.tm)}</strong>
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={handleExportImage}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors"
            >
              <Image size={14} />
              {exporting ? 'Đang xuất...' : 'Xuất ảnh'}
            </button>
            <div className="flex gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
              >
                {loading ? 'Đang lưu...' : 'Lưu bảng lương'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Hidden payslip for export — rendered off-screen */}
      <div style={{ position: 'fixed', left: -9999, top: 0, padding: 16, background: '#f1f5f9' }}>
        <PayslipCard
          ref={slipRef}
          employee={employee}
          entry={form}
          result={result}
          month={month}
          year={year}
          leaveAccrued={leaveAccrued}
          leaveUsed={leaveUsedTotal}
          leaveRemaining={leaveRemaining}
          advance={advance}
        />
      </div>
    </div>
  )
}
