import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect } from 'next/navigation'
import { UserRole } from '@/lib/types'
import HopDongClient from './HopDongClient'

export default async function HopDongPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const supabase = await createClient()

  const [txRes, projectsRes, categoriesRes, suppliersRes, contractDocsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('is_labor', true),
    supabase.from('projects').select('*').order('name'),
    supabase.from('categories').select('*'),
    supabase.from('suppliers').select('*'),
    supabase.from('contract_documents').select('*').order('created_at', { ascending: false }),
  ])

  // Cần thêm dữ liệu vật tư (is_labor=false, có hóa đơn) để tính ngày ký hợp đồng.
  // invoice_date hầu như không được nhập trong app (không có ô nhập) — luôn fallback về transaction_date.
  const materialRes = await supabase
    .from('transactions')
    .select('id, project_id, category_id, is_labor, invoice_status, invoice_date, transaction_date')
    .eq('is_labor', false)
    .eq('invoice_status', 'has_invoice')

  const tableReady = !contractDocsRes.error && !suppliersRes.error

  return (
    <HopDongClient
      laborTransactions={txRes.data ?? []}
      materialTransactions={materialRes.data ?? []}
      projects={projectsRes.data ?? []}
      categories={categoriesRes.data ?? []}
      suppliers={suppliersRes.data ?? []}
      contractDocs={contractDocsRes.data ?? []}
      role={profile.role as UserRole}
      tableReady={tableReady}
    />
  )
}
