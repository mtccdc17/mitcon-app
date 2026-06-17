import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OpexClient from './OpexClient'

export default async function OpexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, id').eq('id', user.id).single()
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  const currentYear = new Date().getFullYear()

  const { data: costs } = await supabase
    .from('operating_costs')
    .select('*')
    .eq('year', currentYear)
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  // Fetch project data for TNDN calculation
  const { data: vatContracts } = await supabase
    .from('contracts')
    .select('value')
    .eq('type', 'vat')

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, vat_amount, is_labor, tncn_amount')

  const totalVatRevenue = (vatContracts ?? []).reduce((s, c) => s + c.value, 0)
  const netVatRevenue = Math.round(totalVatRevenue / 1.1)
  const totalProjectCost = (transactions ?? []).reduce((s, t) => s + t.amount - (t.vat_amount ?? 0), 0)
  const deductibleOpex = (costs ?? []).filter(c => c.is_deductible).reduce((s, c) => s + c.amount, 0)
  const netProfit = netVatRevenue - totalProjectCost - deductibleOpex
  const tndn = Math.max(0, Math.round(netProfit * 0.17))

  // Full data for system-wide backup export
  const [
    { data: allProjects },
    { data: allContracts },
    { data: allCategories },
    { data: allTransactions },
    { data: allRevenue },
    { data: allOpex },
  ] = await Promise.all([
    supabase.from('projects').select('*'),
    supabase.from('contracts').select('*'),
    supabase.from('categories').select('*'),
    supabase.from('transactions').select('*'),
    supabase.from('revenue').select('*'),
    supabase.from('operating_costs').select('*'),
  ])

  return (
    <OpexClient
      costs={costs ?? []}
      userId={user.id}
      year={currentYear}
      tndn={tndn}
      netProfit={netProfit}
      netVatRevenue={netVatRevenue}
      totalProjectCost={totalProjectCost}
      deductibleOpex={deductibleOpex}
      backupData={{
        projects: allProjects ?? [],
        contracts: allContracts ?? [],
        categories: allCategories ?? [],
        transactions: allTransactions ?? [],
        revenue: allRevenue ?? [],
        operatingCosts: allOpex ?? [],
      }}
    />
  )
}
