import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { redirect } from 'next/navigation'
import PayablesClient from './PayablesClient'

export default async function PayablesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const supabase = await createClient()

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*, projects(id, name), categories(name), payment_history')
    // Lấy: (có supplier) HOẶC (nhân công — is_labor = true, dù không có tên NCC)
    .or('and(supplier.not.is.null,supplier.neq.),is_labor.eq.true')
    .order('supplier')
    .order('transaction_date', { ascending: false })

  const rows = (transactions ?? [])
    // Loại bỏ VT không có supplier (chỉ giữ NC không có supplier)
    .filter(t => (t.supplier && t.supplier !== '') || t.is_labor)
    .map(t => {
    const paid =
      t.payment_status === 'paid' ? t.amount
      : t.payment_status === 'partial' ? (t.actual_paid ?? 0)
      : 0
    const owed = t.amount - paid
    return {
      id: t.id as string,
      description: t.description as string,
      amount: t.amount as number,
      payment_status: t.payment_status as string,
      actual_paid: t.actual_paid as number | null,
      transaction_date: t.transaction_date as string,
      supplier: (t.supplier as string) || '(Nhân công — chưa ghi tên)',
      is_labor: t.is_labor as boolean,
      tncn_amount: t.tncn_amount as number | null,
      vat_amount: t.vat_amount as number | null,
      next_payment_date: (t.next_payment_date as string | null) ?? null,
      payment_history: (t.payment_history as { amount: number; date: string; method: string }[] | null) ?? null,
      projects: t.projects as { id: string; name: string } | null,
      categories: t.categories as { name: string } | null,
      paid,
      owed,
    }
  })

  return <PayablesClient rows={rows} />
}
