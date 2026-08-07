import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect } from 'next/navigation'
import { UserRole } from '@/lib/types'
import RevenueClient from './RevenueClient'
import { computeCashflow } from '@/lib/cashflow'

export default async function RevenuePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const role = profile.role as UserRole
  const isCeo = role === 'ceo'
  if (!isCeo) redirect('/dashboard')

  const supabase = await createClient()

  const [
    { data: projects },
    { data: contracts },
    { data: revenue },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name')
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false }),
    supabase
      .from('contracts')
      .select('id, project_id, type, value'),
    supabase
      .from('revenue')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  const cashflow = await computeCashflow(supabase)

  return (
    <RevenueClient
      projects={projects ?? []}
      contracts={contracts ?? []}
      revenue={revenue ?? []}
      isCeo={isCeo}
      userId={user.id}
      cashflow={cashflow}
    />
  )
}
