import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CashflowClient from './CashflowClient'
import { calcPayroll } from '@/app/(app)/payroll/calc'

interface PageProps {
  searchParams: Promise<{ month?: string; year?: string }>
}

export default async function CashflowPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  const params = await searchParams
  const now = new Date()
  const month = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1))))
  const year = parseInt(params.year ?? String(now.getFullYear()))

  // Revenue tất cả channel tháng này
  const { data: revenueRaw } = await supabase
    .from('revenue')
    .select('id, stage, amount, collected_date, project_id, payment_channel, status')
    .eq('status', 'collected')

  function inMonth(collected_date: string | null) {
    if (!collected_date) return false
    const d = new Date(collected_date)
    return d.getMonth() + 1 === month && d.getFullYear() === year
  }

  // Lọc theo tháng/năm của collected_date
  const revenue = (revenueRaw ?? []).filter(r => r.payment_channel === 'tk_cty' && inMonth(r.collected_date))

  // Projects để hiển thị tên
  const { data: projects } = await supabase.from('projects').select('id, name')

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd   = `${year}-${String(month).padStart(2, '0')}-31`

  // Transactions đi qua TK Công ty (có VAT hoặc có HĐ nhân công) — chỉ lấy tháng hiện tại
  const { data: txRaw } = await supabase
    .from('transactions')
    .select('id, project_id, description, supplier, amount, vat_amount, tncn_amount, transaction_date, is_labor, labor_contract_status, bank_paid, bank_paid_date, payment_status, payment_source, is_vat_allocation')
    .or('vat_amount.gt.0,tncn_amount.gt.0')
    .gte('transaction_date', monthStart)
    .lte('transaction_date', monthEnd)
    .order('transaction_date', { ascending: false })

  // Transactions TM / TKCN (không qua TK Công ty) — tháng hiện tại
  const { data: cashTxRaw } = await supabase
    .from('transactions')
    .select('id, project_id, description, supplier, amount, vat_amount, tncn_amount, transaction_date, payment_status, payment_source, bank_paid, bank_paid_date')
    .eq('vat_amount', 0)
    .eq('tncn_amount', 0)
    .eq('is_vat_allocation', false)
    .gte('transaction_date', monthStart)
    .lte('transaction_date', monthEnd)
    .order('transaction_date', { ascending: false })

  const transactions = txRaw ?? []

  // Payroll tháng này
  const [{ data: allEmployees }, { data: entries }] = await Promise.all([
    supabase.from('employees').select('*').order('sort_order'),
    supabase.from('payroll_entries').select('*').eq('month', month).eq('year', year),
  ])

  const entryMap = new Map((entries ?? []).map(e => [e.employee_id, e]))
  let payrollTongLuong = 0, payrollBhxhNLD = 0, payrollBhxhCTY = 0
  // Chỉ tính nếu tháng này đã có dữ liệu bảng lương (có ít nhất 1 entry)
  if ((entries ?? []).length > 0) {
    for (const emp of (allEmployees ?? [])) {
      const entry = entryMap.get(emp.id)
      if (!emp.is_active && !entry) continue
      const isFullSalary = (emp.salary_type ?? 'proportional') === 'full'
      if (!entry && !isFullSalary) continue
      const result = calcPayroll(emp, entry ?? {}, month, year)
      payrollTongLuong += result.tongThucNhan
      payrollBhxhNLD  += result.bhxhNLD
      payrollBhxhCTY  += result.bhxhCTY
    }
  }

  // OPEX cố định tháng này
  const { data: opexCosts } = await supabase
    .from('operating_costs')
    .select('id, name, amount, month, year, is_deductible')
    .eq('month', month)
    .eq('year', year)

  // Số dư đầu kỳ + trạng thái tick lương/BHXH/OPEX
  const { data: balanceSetting } = await supabase
    .from('bank_balance_settings')
    .select('opening_balance, luong_paid, bhxh_paid, opex_paid')
    .eq('month', month)
    .eq('year', year)
    .single()

  // Revenue vào TM và TKCN tháng này
  const revenueTm   = (revenueRaw ?? []).filter(r => r.payment_channel === 'tm'    && inMonth(r.collected_date))
  const revenueTkCn = (revenueRaw ?? []).filter(r => r.payment_channel === 'tk_cn' && inMonth(r.collected_date))

  return (
    <CashflowClient
      key={`${month}-${year}`}
      month={month}
      year={year}
      userId={user.id}
      revenue={revenue}
      revenueTm={revenueTm}
      revenueTkCn={revenueTkCn}
      projects={projects ?? []}
      transactions={transactions}
      cashTransactions={cashTxRaw ?? []}
      payrollTongLuong={payrollTongLuong}
      payrollBhxhNLD={payrollBhxhNLD}
      payrollBhxhCTY={payrollBhxhCTY}
      opexCosts={opexCosts ?? []}
      openingBalance={balanceSetting?.opening_balance ?? null}
      luongPaid={balanceSetting?.luong_paid ?? false}
      bhxhPaid={balanceSetting?.bhxh_paid ?? false}
      opexPaid={balanceSetting?.opex_paid ?? false}
    />
  )
}
