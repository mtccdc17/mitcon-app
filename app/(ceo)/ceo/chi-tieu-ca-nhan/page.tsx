import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { computeCashflow } from '@/lib/cashflow'
import CashflowBox from '@/components/CashflowBox'
import CashflowHistoryModal from '@/components/CashflowHistoryModal'
import CashflowAsOfModal from '@/components/CashflowAsOfModal'
import PersonalExpensesTab from '@/app/(app)/revenue/PersonalExpensesTab'

export default async function ChiTieuCaNhanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, id').eq('id', user.id).single()
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  const [cashflow, { data: personalExpenses }, { data: personalLoans }, { data: channelDeposits }, { data: bankChannels }] = await Promise.all([
    computeCashflow(supabase),
    supabase.from('personal_expenses').select('*').order('date', { ascending: false }),
    supabase.from('personal_loans').select('*').order('date', { ascending: false }),
    supabase.from('channel_deposits').select('*').order('date', { ascending: false }),
    supabase.from('bank_channels').select('*').order('sort_order'),
  ])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Chi tiêu cá nhân</h1>
      <div className="flex items-center justify-end gap-2"><CashflowHistoryModal /><CashflowAsOfModal /></div>
      <CashflowBox cashflow={cashflow} />
      <PersonalExpensesTab
        initialExpenses={personalExpenses ?? []}
        initialLoans={personalLoans ?? []}
        initialDeposits={channelDeposits ?? []}
        initialBankChannels={bankChannels ?? []}
      />
    </div>
  )
}
