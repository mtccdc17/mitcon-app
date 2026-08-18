import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect, notFound } from 'next/navigation'
import { UserRole } from '@/lib/types'
import { formatVND } from '@/lib/utils'
import ProjectDetail from './ProjectDetail'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ edit?: string }>
}) {
  const { id } = await params
  const sp = searchParams ? await searchParams : {}

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
    { data: siteAdvances },
    { data: supervisors },
    { data: allProjects },
    { data: allCategories },
    { data: allocatedFromHere },
    { data: incomingVatRows },
  ] = await Promise.all([
    supabase.from('contracts').select('*').eq('project_id', id),
    supabase.from('categories').select('*').eq('project_id', id).order('sort_order'),
    supabase.from('transactions').select('*, profiles(full_name, role)').eq('project_id', id).order('transaction_date', { ascending: false }),
    supabase.from('revenue').select('*').eq('project_id', id).order('created_at'),
    supabase.from('site_advances').select('*').eq('project_id', id).order('date', { ascending: false }),
    supabase.from('employees').select('id, name').eq('is_site_supervisor', true).order('sort_order'),
    // Tra tên công trình/hạng mục gốc cho các dòng "Phân bổ VAT" trong project này
    supabase.from('projects').select('id, name'),
    supabase.from('categories').select('id, name'),
    // Hạng mục của CHÍNH project này đã bị lấy làm nguồn phân bổ VAT sang công trình khác (kiểu dòng ảo cũ)
    supabase.from('transactions').select('vat_amount, source_category_id, project_id')
      .eq('source_project_id', id).eq('is_vat_allocation', true),
    // Khoản chi thật ở CÔNG TRÌNH KHÁC ghi nhận Phân bổ CHO project này (kiểu gắn trực tiếp mới)
    supabase.from('transactions').select('id, vat_dest_amount, vat_dest_category_id, project_id, category_id, description, transaction_date')
      .eq('vat_dest_project_id', id),
  ])

  // Đã chi từ quỹ tạm ứng = tổng giao dịch có Hình thức TT = "GS chi từ quỹ đã ứng" (note = 'Từ quỹ ứng')
  const advanceSpentTx = (transactions ?? []).filter(t => t.note === 'Từ quỹ ứng')
  const advanceSpent = advanceSpentTx.reduce((s, t) => s + (t.amount ?? 0), 0)
  // Danh sách chi tiết từng khoản trích từ quỹ ứng — để "Trích xuất" xem hạng mục nào đã chi
  const categoryNameForAdvance: Record<string, string> = Object.fromEntries((categories ?? []).map(c => [c.id, c.name]))
  const advanceSpentItems = advanceSpentTx
    .map(t => ({
      id: t.id,
      date: t.transaction_date,
      description: t.description,
      category_name: t.category_id ? (categoryNameForAdvance[t.category_id] ?? null) : null,
      supplier: t.supplier ?? null,
      is_labor: t.is_labor,
      advance_employee_id: t.advance_employee_id ?? null,
      amount: t.amount ?? 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  // Tên công trình / hạng mục — dùng để hiện "← CT nguồn · Hạng mục" cho các dòng Phân bổ VAT
  const projectNameMap: Record<string, string> = Object.fromEntries((allProjects ?? []).map(p => [p.id, p.name]))
  const categoryNameMap: Record<string, string> = Object.fromEntries((allCategories ?? []).map(c => [c.id, c.name]))

  // Hạng mục của project này đã bị dùng làm nguồn phân bổ VAT sang công trình khác (hiện cảnh báo ngược)
  const reverseAlloc: Record<string, { total: number; dests: { name: string; amount: number }[] }> = {}
  for (const t of (allocatedFromHere ?? [])) {
    if (!t.source_category_id) continue
    const bucket = reverseAlloc[t.source_category_id] ?? { total: 0, dests: [] }
    bucket.total += t.vat_amount ?? 0
    bucket.dests.push({ name: projectNameMap[t.project_id ?? ''] ?? 'Công trình khác', amount: t.vat_amount ?? 0 })
    reverseAlloc[t.source_category_id] = bucket
  }

  // "Phân bổ" nhận về từ khoản chi thật ở công trình khác (gắn trực tiếp vào dòng chi phí, VT có VAT hoặc NC có TNCN).
  // CHỈ hiển thị tham khảo tổng chi phí đã phân bổ vào hợp đồng VAT của project này, để CEO tự cân đối doanh thu VAT
  // phù hợp (tự nhập ở tab Doanh thu) — KHÔNG tự động cộng vào chi phí hợp lệ TNDN hay Lợi nhuận thực tế.
  const incomingVatAlloc = {
    total: (incomingVatRows ?? []).reduce((s, t) => s + (t.vat_dest_amount ?? 0), 0),
    items: (incomingVatRows ?? []).map(t => ({
      id: t.id as string,
      amount: t.vat_dest_amount ?? 0,
      description: t.description as string,
      date: t.transaction_date as string,
      destCategoryId: t.vat_dest_category_id as string | null,
      sourceProjectName: projectNameMap[t.project_id ?? ''] ?? 'Công trình khác',
      sourceCategoryName: categoryNameMap[t.category_id ?? ''] ?? '—',
    })),
  }

  // Query audit_logs qua transaction IDs thuộc project này
  const txIds = (transactions ?? []).map(t => t.id)
  const { data: auditLogs } = txIds.length > 0
    ? await supabase.from('audit_logs')
        .select('*, profiles(full_name, role)')
        .in('transaction_id', txIds)
        .order('changed_at', { ascending: false })
        .limit(100)
    : { data: [] }

  return (
    <ProjectDetail
      project={project}
      contracts={contracts ?? []}
      categories={categories ?? []}
      transactions={transactions ?? []}
      revenue={revenue ?? []}
      auditLogs={auditLogs ?? []}
      siteAdvances={siteAdvances ?? []}
      supervisors={supervisors ?? []}
      advanceSpent={advanceSpent}
      advanceSpentItems={advanceSpentItems}
      projectNameMap={projectNameMap}
      categoryNameMap={categoryNameMap}
      reverseAlloc={reverseAlloc}
      incomingVatAlloc={incomingVatAlloc}
      role={profile.role as UserRole}
      userId={profile.id}
      userName={profile.full_name}
      editTxId={sp.edit}
    />
  )
}
