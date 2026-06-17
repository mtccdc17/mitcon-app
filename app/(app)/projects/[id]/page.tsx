import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect, notFound } from 'next/navigation'
import { UserRole } from '@/lib/types'
import { formatVND } from '@/lib/utils'
import ProjectDetail from './ProjectDetail'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const [
    { data: contracts },
    { data: categories },
    { data: transactions },
    { data: revenue },
    { data: auditLogs },
  ] = await Promise.all([
    supabase.from('contracts').select('*').eq('project_id', id),
    supabase.from('categories').select('*').eq('project_id', id).order('sort_order'),
    supabase.from('transactions').select('*, profiles(full_name, role)').eq('project_id', id).order('transaction_date', { ascending: false }),
    supabase.from('revenue').select('*').eq('project_id', id).order('created_at'),
    supabase.from('audit_logs').select('*, profiles(full_name, role)').eq('transaction_id', id).order('changed_at', { ascending: false }).limit(50),
  ])

  return (
    <ProjectDetail
      project={project}
      contracts={contracts ?? []}
      categories={categories ?? []}
      transactions={transactions ?? []}
      revenue={revenue ?? []}
      auditLogs={auditLogs ?? []}
      role={profile.role as UserRole}
      userId={profile.id}
      userName={profile.full_name}
    />
  )
}
