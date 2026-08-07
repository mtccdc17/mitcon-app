'use client'

import { useState } from 'react'
import { Calculator, Users, Gift, Percent } from 'lucide-react'
import PayrollClient from './PayrollClient'
import PayrollAdvancesClient from './PayrollAdvancesClient'
import CommissionClient, { type CommissionRow } from './CommissionClient'
import NhanSuClient from '../nhan-su/NhanSuClient'
import type { Employee, PayrollEntry } from './calc'

type Tab = 'payroll' | 'advances' | 'commission' | 'nhan-su'

interface PayrollAdvance {
  id: string
  staff_id: string
  advance_amount: number
  advance_month: number
  advance_year: number
  is_probation: boolean
  created_by: string
  created_at: string
  notes?: string
  source_channel?: string
}

interface Props {
  allEmployees: Employee[]
  entries: PayrollEntry[]
  month: number
  year: number
  userId: string
  userRole?: string
  advances?: PayrollAdvance[]
  commissions?: CommissionRow[]
  commissionProjects?: { id: string; name: string }[]
}

export default function HRPayrollClient({
  allEmployees, entries, month, year, userId, advances = [],
  commissions = [], commissionProjects = [],
}: Props) {
  const [tab, setTab] = useState<Tab>('payroll')

  return (
    <div className="space-y-4">

      {/* Segmented control — pill iOS style — CEO chốt 2026-08-05: cấp quyền Nhân sự thấy + sửa full 4 tab */}
      <div className="flex justify-center pt-1">
          <div className="flex gap-0.5 bg-gray-100/80 rounded-2xl p-1 shadow-inner">
            <button
              onClick={() => setTab('payroll')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                tab === 'payroll'
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Calculator size={14} />
              Bảng lương
            </button>
            <button
              onClick={() => setTab('advances')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                tab === 'advances'
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Gift size={14} />
              Ứng lương
            </button>
            <button
              onClick={() => setTab('commission')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                tab === 'commission'
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Percent size={14} />
              Hoa hồng CT
              {commissions.filter(c => !c.applied).length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  tab === 'commission' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-500'
                }`}>
                  {new Set(commissions.filter(c => !c.applied).map(c => `${c.employee_id}_${c.pay_month}_${c.pay_year}`)).size}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('nhan-su')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                tab === 'nhan-su'
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users size={14} />
              Nhân sự
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                tab === 'nhan-su' ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
              }`}>
                {allEmployees.filter(e => e.is_active).length}
              </span>
            </button>
          </div>
        </div>

      {/* Content */}
      <div>
        {tab === 'payroll' ? (
          <PayrollClient
            employees={allEmployees}
            entries={entries}
            month={month}
            year={year}
            userId={userId}
            advances={advances}
          />
        ) : tab === 'advances' ? (
          <PayrollAdvancesClient
            allEmployees={allEmployees}
            entries={entries}
            month={month}
            year={year}
            userId={userId}
            advances={advances}
          />
        ) : tab === 'commission' ? (
          <CommissionClient
            commissions={commissions}
            employees={allEmployees}
            projects={commissionProjects}
            userId={userId}
          />
        ) : (
          // Employee[] is structurally compatible with EmployeeRow[]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <NhanSuClient employees={allEmployees as any} userId={userId} />
        )}
      </div>

    </div>
  )
}
