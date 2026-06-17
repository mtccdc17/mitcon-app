import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SecurityClient from './SecurityClient'

export default async function SecurityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single()
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  const { data: config } = await supabase.from('security_config').select('*').single()

  return <SecurityClient config={config} userId={user.id} userEmail={profile.email} />
}
