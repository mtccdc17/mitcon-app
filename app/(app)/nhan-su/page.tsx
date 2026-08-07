import { redirect } from 'next/navigation'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { createClient } from '@/lib/supabase/server'
import NhanSuClient from './NhanSuClient'
import { attachSalaryChanges } from '@/app/(app)/payroll/calc'

export default async function NhanSuPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  const supabase = await createClient()
  const [{ data: employees }, { data: salaryChanges }] = await Promise.all([
    supabase.from('employees').select('*').order('sort_order'),
    supabase.from('salary_changes').select('*').order('effective_year', { ascending: false }).order('effective_month', { ascending: false }),
  ])

  return (
    <NhanSuClient
      employees={attachSalaryChanges(employees ?? [], salaryChanges ?? [])}
      userId={user.id}
    />
  )
}
