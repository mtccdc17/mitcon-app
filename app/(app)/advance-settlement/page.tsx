import { redirect } from 'next/navigation'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { createClient } from '@/lib/supabase/server'
import AdvanceSettlementClient from './AdvanceSettlementClient'

const ALLOWED_ROLES = ['ceo', 'ketoan', 'thicong']

export default async function AdvanceSettlementPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) redirect('/dashboard')

  // Chỉ CEO được sửa/xóa/chốt quỹ — kế toán & thi công chỉ theo dõi
  const canEdit = profile.role === 'ceo'

  const supabase = await createClient()

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
      canEdit={canEdit}
      advances={advances ?? []}
      projects={projects ?? []}
      employees={employees ?? []}
      spentByEmployeeProject={spentByEmployeeProject}
    />
  )
}
