'use client'

import { useMemo, useState } from 'react'
import { Pencil, UserPlus, TrendingUp, CalendarDays } from 'lucide-react'
import EmployeeModal, { EmployeeRow } from './EmployeeModal'
import SalaryChangeModal from './SalaryChangeModal'
import WorkScheduleModal from '@/app/(app)/payroll/WorkScheduleModal'
import { formatVND } from '@/lib/utils'
import { effectiveBaseSalary } from '@/app/(app)/payroll/calc'

const DEPT_COLOR: Record<string, string> = {
  'Thiết kế': 'bg-blue-100 text-blue-700',
  'Thi công':  'bg-orange-100 text-orange-700',
  'Marketing': 'bg-pink-100 text-pink-700',
  'Kế toán':   'bg-green-100 text-green-700',
  'Giám đốc':  'bg-purple-100 text-purple-700',
}

const EMP_TYPE: Record<string, { label: string; color: string }> = {
  chinh_thuc:    { label: 'Chính thức',   color: 'bg-green-50 text-green-700' },
  thu_viec:      { label: 'Thử việc',      color: 'bg-orange-50 text-orange-600' },
  thuc_tap_sinh: { label: 'Thực tập sinh', color: 'bg-blue-50 text-blue-600' },
}

type Tab = 'all' | 'chinh_thuc' | 'thu_viec' | 'thuc_tap_sinh' | 'thoi_viec'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',           label: 'Tất cả' },
  { key: 'chinh_thuc',    label: 'Chính thức' },
  { key: 'thu_viec',      label: 'Thử việc' },
  { key: 'thuc_tap_sinh', label: 'Thực tập sinh' },
  { key: 'thoi_viec',     label: 'Thôi việc' },
]

interface Props {
  employees: EmployeeRow[]
  userId: string
}

export default function NhanSuClient({ employees, userId }: Props) {
  const [tab, setTab] = useState<Tab>('all')
  // undefined = closed | null = add new | EmployeeRow = edit
  const [modal, setModal] = useState<EmployeeRow | null | undefined>(undefined)
  const [salaryModal, setSalaryModal] = useState<EmployeeRow | null>(null)
  const [scheduleModal, setScheduleModal] = useState<EmployeeRow | null>(null)
  const now = new Date()

  const counts = useMemo(() => ({
    all:           employees.length,
    chinh_thuc:    employees.filter(e => e.is_active && e.employment_type === 'chinh_thuc').length,
    thu_viec:      employees.filter(e => e.is_active && e.employment_type === 'thu_viec').length,
    thuc_tap_sinh: employees.filter(e => e.is_active && e.employment_type === 'thuc_tap_sinh').length,
    thoi_viec:     employees.filter(e => !e.is_active).length,
  }), [employees])

  const filtered = useMemo(() => {
    if (tab === 'all')        return employees
    if (tab === 'thoi_viec')  return employees.filter(e => !e.is_active)
    return employees.filter(e => e.is_active && e.employment_type === tab)
  }, [employees, tab])

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nhân sự</h1>
          <p className="text-sm text-gray-400">
            Mitcon Decor &amp; Design · Nhân sự đang làm sẽ tự động xuất hiện trong bảng lương
          </p>
        </div>
        <button
          onClick={() => setModal(null)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={14} /> Thêm nhân sự
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-100 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
            }`}
          >
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-8">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Họ tên</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Phòng ban</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Trạng thái</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Lương HĐ</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Lương BHXH</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">TK / Ngân hàng</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-gray-400 text-sm">
                    Không có nhân sự nào trong danh sách này.
                  </td>
                </tr>
              ) : filtered.map((emp, idx) => (
                <tr
                  key={emp.id}
                  className={`hover:bg-gray-50/40 transition-colors ${!emp.is_active ? 'opacity-55' : ''}`}
                >
                  <td className="px-4 py-3.5 text-xs text-gray-400">{idx + 1}</td>

                  <td className="px-4 py-3.5">
                    <p className="font-medium text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {emp.msnv && <span>{emp.msnv} · </span>}
                      {emp.title}
                    </p>
                  </td>

                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DEPT_COLOR[emp.dept ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                      {emp.dept ?? '—'}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    {emp.is_active ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EMP_TYPE[emp.employment_type]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                        {EMP_TYPE[emp.employment_type]?.label ?? emp.employment_type}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                        Thôi việc
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-right tabular-nums text-gray-800 font-medium">
                    {emp.base_salary > 0 ? formatVND(effectiveBaseSalary(emp, now.getMonth() + 1, now.getFullYear())) : '—'}
                  </td>

                  <td className="px-4 py-3.5 text-right tabular-nums text-gray-500 text-xs">
                    {emp.bhxh_base > 0 ? formatVND(emp.bhxh_base) : '—'}
                  </td>

                  <td className="px-4 py-3.5">
                    {emp.bank_account ? (
                      <div>
                        <p className="text-xs font-mono text-gray-700">{emp.bank_account}</p>
                        <p className="text-xs text-gray-400">{emp.bank_name}</p>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1">
                      {emp.is_active && (
                        <button
                          onClick={() => setSalaryModal(emp)}
                          title="Xác nhận tăng lương"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-green-600 hover:bg-green-50 transition-colors"
                        >
                          <TrendingUp size={13} />
                        </button>
                      )}
                      {emp.is_active && (
                        <button
                          onClick={() => setScheduleModal(emp)}
                          title="Sửa lịch làm việc"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <CalendarDays size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => setModal(emp)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal !== undefined && (
        <EmployeeModal
          employee={modal}
          onClose={() => setModal(undefined)}
          userId={userId}
        />
      )}

      {salaryModal && (
        <SalaryChangeModal
          employee={salaryModal}
          userId={userId}
          onClose={() => setSalaryModal(null)}
        />
      )}

      {scheduleModal && (
        <WorkScheduleModal
          employee={scheduleModal}
          onClose={() => setScheduleModal(null)}
        />
      )}
    </div>
  )
}
