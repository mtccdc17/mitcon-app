import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect } from 'next/navigation'
import { UserRole } from '@/lib/types'
import SuppliersClient from './SuppliersClient'

export default async function SuppliersPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const supabase = await createClient()
  const { data: suppliers, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name')

  return (
    <SuppliersClient
      suppliers={suppliers ?? []}
      role={profile.role as UserRole}
      tableReady={!error}
    />
  )
}
