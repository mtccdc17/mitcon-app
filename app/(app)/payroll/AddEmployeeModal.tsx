'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
  userId: string
}

export default function AddEmployeeModal({ onClose, userId: _userId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', msnv: '', title: '', dept: 'Thiết kế',
    employment_type: 'chinh_thuc',
    salary_type: 'proportional',
    base_salary: '', bhxh_base: '',
    hoa_hong_rate: '0', bank_account: '', bank_name: '',
    dependents: '0',
    grab_eligible: false,
  })

  function set(k: string, v: string | boolean) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return alert('Vui lòng nhập họ tên.')
    setLoading(true)

    const { error } = await supabase.from('employees').insert({
      name:            form.name.trim(),
      msnv:            form.msnv.trim() || null,
      title:           form.title.trim() || null,
      dept:            form.dept,
      employment_type: form.employment_type,
      salary_type:     form.salary_type,
      base_salary:     parseInt(form.base_salary) || 0,
      bhxh_base:       parseInt(form.bhxh_base) || 0,
      dependents:      parseInt(form.dependents) || 0,
      hoa_hong_rate:   parseFloat(form.hoa_hong_rate) || 0,
      bank_account:    form.bank_account.trim() || '',
      bank_name:       form.bank_name.trim() || '',
      grab_eligible:   form.grab_eligible,
    })

    if (!error) { router.refresh(); onClose() }
    else {
      console.error('Add employee error:', error)
      alert(
        'Lỗi khi thêm nhân sự:\n' +
        (error.message ?? '') +
        (error.code ? `\n[code: ${error.code}]` : '') +
        (error.details ? `\n${error.details}` : '') +
        (error.hint ? `\nHint: ${error.hint}` : '')
      )
      setLoading(false)
    }
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-gray-700 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Thêm nhân sự mới</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name + MSNV */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Họ tên <span className="text-red-500">*</span></label>
              <input required className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="VD: NGUYỄN VĂN A" />
            </div>
            <div>
              <label className={lbl}>Mã NV</label>
              <input className={inp} value={form.msnv} onChange={e => set('msnv', e.target.value)} placeholder="VD: PTK04" />
            </div>
            <div>
              <label className={lbl}>Chức danh</label>
              <input className={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Nhân viên thiết kế" />
            </div>
          </div>

          {/* Dept + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Phòng ban</label>
              <select className={inp} value={form.dept} onChange={e => set('dept', e.target.value)}>
                <option>Thiết kế</option>
                <option>Thi công</option>
                <option>Marketing</option>
                <option>Kế toán</option>
                <option>Giám đốc</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Loại hợp đồng</label>
              <select className={inp} value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
                <option value="chinh_thuc">Chính thức</option>
                <option value="thu_viec">Thử việc</option>
                <option value="thuc_tap_sinh">Thực tập sinh</option>
              </select>
            </div>
          </div>

          {/* Salary type */}
          <div>
            <label className={lbl}>Cách tính lương</label>
            <select className={inp} value={form.salary_type} onChange={e => set('salary_type', e.target.value)}>
              <option value="proportional">Tính theo ngày công (thông thường)</option>
              <option value="full">Lương cố định toàn tháng (không tính ngày công)</option>
            </select>
          </div>

          {/* Salary */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Lương HĐ (đ)</label>
              <input className={`${inp} text-right`} type="number" min="0" value={form.base_salary} onChange={e => set('base_salary', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Lương BHXH (đ)</label>
              <input className={`${inp} text-right`} type="number" min="0" value={form.bhxh_base} onChange={e => set('bhxh_base', e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* TNCN dependents */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Số người phụ thuộc (TNCN)</label>
              <input className={`${inp} text-right`} type="number" min="0" max="10" value={form.dependents} onChange={e => set('dependents', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Hoa hồng (%)</label>
              <input className={`${inp} text-right`} type="number" min="0" step="0.1" value={form.hoa_hong_rate} onChange={e => set('hoa_hong_rate', e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Bank */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Số tài khoản</label>
              <input className={inp} value={form.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder="0123456789" />
            </div>
            <div>
              <label className={lbl}>Ngân hàng</label>
              <input className={inp} value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="VIETCOMBANK" />
            </div>
          </div>

          {/* Grab */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.grab_eligible} onChange={e => set('grab_eligible', e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600" />
            Được hưởng phụ cấp Grab
          </label>

          <div className="flex justify-end gap-3 pt-1 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Hủy
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : 'Thêm nhân sự'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
