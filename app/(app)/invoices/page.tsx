import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect } from 'next/navigation'
import InvoicesClient from './InvoicesClient'

export default async function InvoicesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const supabase = await createClient()

  const [{ data: transactions }, { data: outputContracts }, { data: projectsRaw }] = await Promise.all([
    supabase
      .from('transactions')
      // transactions có nhiều cột tham chiếu tới projects/categories (project_id, source_project_id,
      // vat_dest_project_id, ...) nên PostgREST cần chỉ rõ FK để embed đúng — nếu để tên bảng trơn
      // "projects(name)" quan hệ bị ambiguous và query trả về rỗng không báo lỗi rõ ràng.
      .select('*, projects!project_id(name), categories!category_id(name)')
      .gt('vat_amount', 0)
      .order('transaction_date', { ascending: false }),
    supabase
      .from('contracts')
      .select('id, project_id, value, invoice_issue_date')
      .eq('type', 'vat')
      .gt('value', 0),
    supabase
      .from('projects')
      .select('id, name')
      .in('status', ['active', 'completed'])
      .order('name'),
  ])

  return (
    <InvoicesClient
      rows={(transactions ?? []) as Parameters<typeof InvoicesClient>[0]['rows']}
      outputInvoices={(outputContracts ?? []) as Parameters<typeof InvoicesClient>[0]['outputInvoices']}
      projects={projectsRaw ?? []}
    />
  )
}
