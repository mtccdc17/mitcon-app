'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, AlertTriangle } from 'lucide-react'
import type { SalaryChange } from '@/app/(app)/payroll/calc'

const DEPTS = ['Thiết kế', 'Thi công', 'Marketing', 'Kế toán', 'Giám đốc']

export interface EmployeeRow {
  id: string
  name: string
  msnv?: string | null
  title?: string | null
  dept?: string | null
  employment_type: string
  salary_type: string
  base_salary: number
  bhxh_base: number
  dependents: number
  hoa_hong_rate: number
  bank_account?: string | null
  bank_name?: string | null
  grab_eligible: boolean
  is_active: boolean
  sort_order: number
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

interface Props {
  employee?: EmployeeRow | null   // null = add mode
  onClose: () => void
  userId: string
}

export default function EmployeeModal({ employee, onClose, userId: _userId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [endMonth, setEndMonth] = useState(String(new Date().getMonth() + 1))
  const [endYear,  setEndYear]  = useState(String(new Date().getFullYear()))

  const isEdit = !!employee

  const [form, setForm] = useState({
    name:            employee?.name            ?? '',
    msnv:            employee?.msnv            ?? '',
    title:           employee?.title           ?? '',
    dept:            employee?.dept            ?? 'Thiết kế',
    employment_type: employee?.employment_type ?? 'chinh_thuc',
    salary_type:     employee?.salary_type     ?? 'proportional',
    base_salary:     employee ? String(employee.base_salary)  : '',
    bhxh_base:       employee ? String(employee.bhxh_base)    : '',
    dependents:      employee ? String(employee.dependents)   : '0',
    hoa_hong_rate:   employee ? String(employee.hoa_hong_rate): '0',
    bank_account:    employee?.bank_account ?? '',
    bank_name:       employee?.bank_name    ?? '',
    grab_eligible:   employee?.grab_eligible ?? false,
    start_month:         employee?.start_month         ? String(employee.start_month)         : (employee ? '' : String(new Date().getMonth() + 1)),
    start_year:          employee?.start_year          ? String(employee.start_year)          : (employee ? '' : String(new Date().getFullYear())),
    official_from_month: employee?.official_from_month ? String(employee.official_from_month) : '',
    official_from_year:  employee?.official_from_year  ? String(employee.official_from_year)  : '',
    bhxh_from_month:     employee?.bhxh_from_month      ? String(employee.bhxh_from_month)      : '',
    bhxh_from_year:      employee?.bhxh_from_year       ? String(employee.bhxh_from_year)       : '',
  })

  function set(k: string, v: string | boolean) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return alert('Vui lòng nhập họ tên.')
    setLoading(true)

    const payload = {
      name:            form.name.trim(),
      msnv:            form.msnv.trim()    || null,
      title:           form.title.trim()   || null,
      dept:            form.dept,
      employment_type: form.employment_type,
      salary_type:     form.salary_type,
      base_salary:     parseInt(form.base_salary)     || 0,
      bhxh_base:       parseInt(form.bhxh_base)       || 0,
      dependents:      parseInt(form.dependents)      || 0,
      hoa_hong_rate:   parseFloat(form.hoa_hong_rate.replace(',', '.')) || 0,
      bank_account:    form.bank_account.trim() || null,
      bank_name:       form.bank_name.trim()    || null,
      grab_eligible:   form.grab_eligible,
      start_month:         parseInt(form.start_month)         || null,
      start_year:          parseInt(form.start_year)          || null,
      official_from_month: parseInt(form.official_from_month) || null,
      official_from_year:  parseInt(form.official_from_year)  || null,
      bhxh_from_month:     parseInt(form.bhxh_from_month)      || null,
      bhxh_from_year:      parseInt(form.bhxh_from_year)       || null,
    }

    let saveError: { message?: string } | null = null
    if (isEdit) {
      const res = await supabase.from('employees').update(payload).eq('id', employee!.id)
      saveError = res.error
    } else {
      const { data: maxRow } = await supabase
        .from('employees').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
      const nextSort = (maxRow?.sort_order ?? 0) + 1
      const res = await supabase.from('employees').insert({
        ...payload, is_active: true, sort_order: nextSort,
      })
      saveError = res.error
    }

    if (!saveError) { router.refresh(); onClose() }
    else {
      console.error('Employee save error:', saveError)
      alert(`Lỗi: ${saveError.message ?? 'Không xác định'}. Vui lòng thử lại.`)
      setLoading(false)
    }
  }

  async function handleArchive() {
    if (!employee) return
    if (!endMonth || !endYear) return alert('Vui lòng nhập tháng/năm nghỉ việc.')
    setLoading(true)
    const { error } = await supabase
      .from('employees')
      .update({ is_active: false, end_month: parseInt(endMonth), end_year: parseInt(endYear) })
      .eq('id', employee.id)
    if (!error) { router.refresh(); onClose() }
    else { alert('Lỗi. Vui lòng thử lại.'); setLoading(false) }
  }

  async function handleRestore() {
    if (!employee) return
    setLoading(true)
    const { error } = await supabase
      .from('employees').update({ is_active: true, end_month: null, end_year: null }).eq('id', employee.id)
    if (!error) { router.refresh(); onClose() }
    else { alert('Lỗi. Vui lòng thử lại.'); setLoading(false) }
  }

  async function handleDelete() {
    if (!employee) return
    setLoading(true)
    // Xóa payroll_entries liên quan trước (nếu có)
    await supabase.from('payroll_entries').delete().eq('employee_id', employee.id)
    const { error } = await supabase.from('employees').delete().eq('id', employee.id)
    if (!error) { router.refresh(); onClose() }
    else { alert(`Lỗi xóa: ${error.message}`); setLoading(false) }
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-700 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-6">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">
              {isEdit ? 'Chỉnh sửa nhân sự' : 'Thêm nhân sự mới'}
            </h2>
            {isEdit && !employee.is_active && (
              <span className="text-xs text-red-500 font-medium">Đã thôi việc</span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Name + MSNV */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Họ tên <span className="text-red-500">*</span></label>
              <input required className={inp} value={form.name}
                onChange={e => set('name', e.target.value)} placeholder="VD: NGUYỄN VĂN A" />
            </div>
            <div>
              <label className={lbl}>Mã NV</label>
              <input className={inp} value={form.msnv}
                onChange={e => set('msnv', e.target.value)} placeholder="VD: PTK04" />
            </div>
            <div>
              <label className={lbl}>Chức danh</label>
              <input className={inp} value={form.title}
                onChange={e => set('title', e.target.value)} placeholder="Nhân viên thiết kế" />
            </div>
          </div>

          {/* Dept + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Phòng ban</label>
              <select className={inp} value={form.dept} onChange={e => set('dept', e.target.value)}>
                {DEPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Loại hợp đồng</label>
              <select className={inp} value={form.employment_type}
                onChange={e => set('employment_type', e.target.value)}>
                <option value="chinh_thuc">Chính thức</option>
                <option value="thu_viec">Thử việc</option>
                <option value="thuc_tap_sinh">Thực tập sinh</option>
              </select>
            </div>
          </div>

          {/* Salary type */}
          <div>
            <label className={lbl}>Cách tính lương</label>
            <select className={inp} value={form.salary_type}
              onChange={e => set('salary_type', e.target.value)}>
              <option value="proportional">Tính theo ngày công (thông thường)</option>
              <option value="full">Lương cố định toàn tháng (không tính ngày công)</option>
            </select>
          </div>

          {/* Ngày vào làm + Chính thức từ */}
          <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-amber-800">Thời gian làm việc</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Vào làm — tháng</label>
                <input className={`${inp} text-right`} type="number" min="1" max="12"
                  value={form.start_month} onChange={e => set('start_month', e.target.value)} placeholder="Chưa nhập" />
              </div>
              <div>
                <label className={lbl}>Vào làm — năm</label>
                <input className={`${inp} text-right`} type="number" min="2020" max="2100"
                  value={form.start_year} onChange={e => set('start_year', e.target.value)} placeholder="Chưa nhập" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Chính thức từ — tháng</label>
                <input className={`${inp} text-right`} type="number" min="1" max="12"
                  value={form.official_from_month} onChange={e => set('official_from_month', e.target.value)} placeholder="Chưa nhập" />
              </div>
              <div>
                <label className={lbl}>Chính thức từ — năm</label>
                <input className={`${inp} text-right`} type="number" min="2020" max="2100"
                  value={form.official_from_year} onChange={e => set('official_from_year', e.target.value)} placeholder="Chưa nhập" />
              </div>
            </div>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Trước mốc chính thức → tính <strong>85% lương</strong> (thử việc, không trừ BHXH).
              Từ mốc trở đi → <strong>100%</strong> + trừ BHXH. Để trống mốc nếu chưa xác định.
            </p>
          </div>

          {/* Đóng BHXH từ — mốc riêng, tách khỏi mốc Chính thức */}
          <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-purple-800">Đóng BHXH từ</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Đóng BHXH từ — tháng</label>
                <input className={`${inp} text-right`} type="number" min="1" max="12"
                  value={form.bhxh_from_month} onChange={e => set('bhxh_from_month', e.target.value)} placeholder="Theo mốc Chính thức" />
              </div>
              <div>
                <label className={lbl}>Đóng BHXH từ — năm</label>
                <input className={`${inp} text-right`} type="number" min="2020" max="2100"
                  value={form.bhxh_from_year} onChange={e => set('bhxh_from_year', e.target.value)} placeholder="Theo mốc Chính thức" />
              </div>
            </div>
            <p className="text-[11px] text-purple-700 leading-relaxed">
              Dùng khi NV đã <strong>chính thức</strong> (nhận đủ 100% lương) nhưng công ty <strong>chưa kịp đăng ký BHXH</strong> ngay.
              Để trống → mặc định tính theo mốc Chính thức ở trên. Điền riêng → BHXH chỉ bắt đầu trừ từ tháng này,
              các tháng trước đó vẫn 100% lương nhưng chưa trừ BHXH.
            </p>
          </div>

          {/* Salary */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Lương HĐ (đ)</label>
              <input className={`${inp} text-right`} type="number" min="0"
                value={form.base_salary} onChange={e => set('base_salary', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Lương BHXH (đ)</label>
              <input className={`${inp} text-right`} type="number" min="0"
                value={form.bhxh_base} onChange={e => set('bhxh_base', e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* TNCN + Hoa hong */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Số người phụ thuộc (TNCN)</label>
              <input className={`${inp} text-right`} type="number" min="0" max="10"
                value={form.dependents} onChange={e => set('dependents', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Hoa hồng (%)</label>
              <input className={`${inp} text-right`} type="number" min="0" step="0.1"
                value={form.hoa_hong_rate} onChange={e => set('hoa_hong_rate', e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Bank */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Số tài khoản</label>
              <input className={inp} value={form.bank_account}
                onChange={e => set('bank_account', e.target.value)} placeholder="0123456789" />
            </div>
            <div>
              <label className={lbl}>Ngân hàng</label>
              <input className={inp} value={form.bank_name}
                onChange={e => set('bank_name', e.target.value)} placeholder="VIETCOMBANK" />
            </div>
          </div>

          {/* Grab */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.grab_eligible}
              onChange={e => set('grab_eligible', e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600" />
            Được hưởng phụ cấp Grab
          </label>

          {/* Delete confirm box */}
          {isEdit && confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-2.5 mb-3">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">
                  Xóa vĩnh viễn <strong>{employee.name}</strong>? Toàn bộ lịch sử bảng lương của nhân sự này cũng sẽ bị xóa và <strong>không thể khôi phục</strong>.
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                  Hủy
                </button>
                <button type="button" onClick={handleDelete} disabled={loading}
                  className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50">
                  Xóa vĩnh viễn
                </button>
              </div>
            </div>
          )}

          {/* Archive confirm box */}
          {isEdit && employee.is_active && confirmArchive && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-2.5 mb-3">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">
                  Đánh dấu <strong>{employee.name}</strong> thôi việc? Nhân sự sẽ không còn
                  xuất hiện trong bảng lương từ sau tháng nghỉ trở đi (các tháng trước đó vẫn giữ nguyên).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={lbl}>Nghỉ việc từ — tháng</label>
                  <input className={`${inp} text-right`} type="number" min="1" max="12"
                    value={endMonth} onChange={e => setEndMonth(e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Nghỉ việc từ — năm</label>
                  <input className={`${inp} text-right`} type="number" min="2020" max="2100"
                    value={endYear} onChange={e => setEndYear(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmArchive(false)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                  Hủy
                </button>
                <button type="button" onClick={handleArchive} disabled={loading}
                  className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                  Xác nhận thôi việc
                </button>
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center pt-1 border-t border-gray-100">
            {/* Left: archive / restore / delete */}
            {isEdit && !confirmArchive && !confirmDelete && (
              <div className="flex flex-col gap-0.5">
                {employee.is_active && (
                  <button type="button" onClick={() => setConfirmArchive(true)}
                    className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors text-left">
                    Đánh dấu thôi việc
                  </button>
                )}
                {!employee.is_active && (
                  <button type="button" onClick={handleRestore} disabled={loading}
                    className="px-3 py-1.5 text-sm text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 text-left">
                    Tái ký hợp đồng
                  </button>
                )}
                <button type="button" onClick={() => { setConfirmArchive(false); setConfirmDelete(true) }}
                  className="px-3 py-1.5 text-sm text-red-700 font-medium hover:bg-red-50 rounded-lg transition-colors text-left">
                  Xóa nhân sự
                </button>
              </div>
            )}

            {/* Right: cancel + save */}
            <div className="flex gap-3 ml-auto">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Hủy
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
                {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm nhân sự'}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  )
}
