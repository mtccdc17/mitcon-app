import { redirect } from 'next/navigation'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { createClient } from '@/lib/supabase/server'
import AdvanceSettlementClient, { type SpentItem } from './AdvanceSettlementClient'

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
    { data: allCategories },
  ] = await Promise.all([
    supabase.from('site_advances').select('*').order('date', { ascending: false }),
    supabase.from('projects').select('id, name, status'),
    supabase.from('employees').select('id, name').eq('is_site_supervisor', true).order('sort_order'),
    supabase
      .from('transactions')
      .select('id, amount, advance_employee_id, project_id, transaction_date, description, category_id, supplier, is_labor')
      .not('advance_employee_id', 'is', null),
    supabase.from('categories').select('id, name'),
  ])

  const catName: Record<string, string> = Object.fromEntries((allCategories ?? []).map(c => [c.id, c.name]))

  // Tính "Đã chi" cho từng employee × project + danh sách chi tiết từng khoản
  const spentByEmployeeProject: Record<string, Record<string, number>> = {}
  const spentItemsByEmployeeProject: Record<string, Record<string, SpentItem[]>> = {}
  for (const t of allTransactions ?? []) {
    if (!t.advance_employee_id) continue
    const empKey = t.advance_employee_id
    const projKey = t.project_id ?? 'unknown'
    if (!spentByEmployeeProject[empKey]) spentByEmployeeProject[empKey] = {}
    spentByEmployeeProject[empKey][projKey] = (spentByEmployeeProject[empKey][projKey] ?? 0) + (t.amount ?? 0)

    if (!spentItemsByEmployeeProject[empKey]) spentItemsByEmployeeProject[empKey] = {}
    if (!spentItemsByEmployeeProject[empKey][projKey]) spentItemsByEmployeeProject[empKey][projKey] = []
    spentItemsByEmployeeProject[empKey][projKey].push({
      id: t.id,
      date: t.transaction_date,
      description: t.description ?? '',
      category_name: t.category_id ? (catName[t.category_id] ?? null) : null,
      supplier: t.supplier ?? null,
      is_labor: !!t.is_labor,
      amount: t.amount ?? 0,
    })
  }
  for (const emp of Object.values(spentItemsByEmployeeProject)) {
    for (const items of Object.values(emp)) items.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }

  return (
    <AdvanceSettlementClient
      userId={user.id}
      canEdit={canEdit}
      advances={advances ?? []}
      projects={projects ?? []}
      employees={employees ?? []}
      spentByEmployeeProject={spentByEmployeeProject}
      spentItemsByEmployeeProject={spentItemsByEmployeeProject}
    />
  )
}
