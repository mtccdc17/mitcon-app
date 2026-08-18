import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdvanceSettlementClient from './AdvanceSettlementClient'

export default async function AdvanceSettlementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, id').eq('id', user.id).single()
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  // Load dữ liệu tạm ứng công trình
  const [
    { data: advances },
    { data: projects },
    { data: employees },
    { data: allTransactions },
  ] = await Promise.all([
    supabase.from('site_advances').select('*').order('date', { ascending: false }),
    supabase.from('projects').select('id, name, status'),
    supabase.from('employees').select('id, name').eq('is_site_supervisor', true).order('sort_order'),
    supabase.from('transactions').select('amount, advance_employee_id, project_id'),
  ])

  // Tính "Đã chi" cho từng employee × project
  const spentByEmployeeProject: Record<string, Record<string, number>> = {}
  for (const t of allTransactions ?? []) {
    if (!t.advance_employee_id) continue
    const empKey = t.advance_employee_id
    const projKey = t.project_id ?? 'unknown'
    if (!spentByEmployeeProject[empKey]) spentByEmployeeProject[empKey] = {}
    spentByEmployeeProject[empKey][projKey] = (spentByEmployeeProject[empKey][projKey] ?? 0) + (t.amount ?? 0)
  }

  return (
    <AdvanceSettlementClient
      userId={user.id}
      advances={advances ?? []}
      projects={projects ?? []}
      employees={employees ?? []}
      spentByEmployeeProject={spentByEmployeeProject}
    />
  )
}
