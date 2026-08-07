import { redirect } from 'next/navigation'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { createClient } from '@/lib/supabase/server'
import HRPayrollClient from './HRPayrollClient'
import { attachSalaryChanges } from './calc'
import { syncProjectCommissions } from '@/lib/commissions'

interface PageProps {
  searchParams: Promise<{ month?: string; year?: string }>
}

export default async function PayrollPage({ searchParams }: PageProps) {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  // CEO chốt 2026-08-05: Bảng lương CHỈ cấp quyền cho CEO + Nhân sự — không có thumua/ketoan.
  const isPayrollStaff = profile?.role === 'nhansu'
    || (user.app_metadata as Record<string, string>)?.role === 'nhansu'
  if (!profile || (profile.role !== 'ceo' && !isPayrollStaff)) redirect('/dashboard')

  const params = await searchParams
  const now = new Date()
  const month = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1))))
  const year  = parseInt(params.year ?? String(now.getFullYear()))

  const supabase = await createClient()

  // Đồng bộ hoa hồng công trình (đợt Quyết toán của công trình đã tick Hiếu/Tấn) trước khi render.
  if (profile.role === 'ceo' || isPayrollStaff) await syncProjectCommissions(supabase)

  const [{ data: allEmployees }, { data: entries }, { data: advances }, { data: salaryChanges }, { data: commissions }, { data: commissionProjects }] = await Promise.all([
    supabase.from('employees').select('*').order('sort_order'),   // ALL — incl. thoi_viec
    supabase.from('payroll_entries').select('*').eq('month', month).eq('year', year),
    supabase.from('payroll_advances').select('*'),
    supabase.from('salary_changes').select('*'),
    supabase.from('project_commissions').select('*').order('pay_year', { ascending: false }).order('pay_month', { ascending: false }),
    supabase.from('projects').select('id, name'),
  ])

  return (
    <HRPayrollClient
      allEmployees={attachSalaryChanges(allEmployees ?? [], salaryChanges ?? [])}
      entries={entries ?? []}
      month={month}
      year={year}
      userId={user.id}
      userRole={profile.role}
      advances={advances ?? []}
      commissions={commissions ?? []}
      commissionProjects={commissionProjects ?? []}
    />
  )
}
