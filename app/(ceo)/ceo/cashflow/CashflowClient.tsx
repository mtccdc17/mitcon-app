'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatVND } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Check, Building2, Pencil } from 'lucide-react'

const MONTH_VN = ['','Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

interface RevenueRow {
  id: string; stage: string; amount: number
  collected_date: string | null; project_id: string; payment_channel: string | null
}
interface TxRow {
  id: string; project_id: string; description: string; supplier: string | null
  amount: number; vat_amount: number; tncn_amount: number
  transaction_date: string; bank_paid: boolean; bank_paid_date: string | null
  payment_status: string; payment_source?: string | null; is_vat_allocation?: boolean
}
interface OpexRow { id: string; name: string; amount: number }
interface Project  { id: string; name: string }

interface Props {
  month: number; year: number; userId: string
  revenue: RevenueRow[]; revenueTm: RevenueRow[]; revenueTkCn: RevenueRow[]
  projects: Project[]
  transactions: TxRow[]; cashTransactions: TxRow[]
  payrollTongLuong: number; payrollBhxhNLD: number; payrollBhxhCTY: number
  opexCosts: OpexRow[]
  openingBalance: number | null
  luongPaid: boolean; bhxhPaid: boolean; opexPaid: boolean
}

export default function CashflowClient(props: Props) {
  const { month, year, revenue, revenueTm, revenueTkCn, projects,
          transactions, cashTransactions,
          payrollTongLuong, payrollBhxhNLD, payrollBhxhCTY, opexCosts } = props
  const router = useRouter()
  const supabase = createClient()

  const [bankTxMap, setBankTxMap] = useState<Map<string, boolean>>(() =>
    new Map(transactions.map(t => [t.id, t.bank_paid || t.payment_status === 'paid']))
  )
  const [savingBankId, setSavingBankId] = useState<string | null>(null)
  const [cashTxSource, setCashTxSource] = useState<Map<string, string>>(() =>
    new Map(cashTransactions.map(t => [t.id, t.payment_source ?? '']))
  )
  const [savingCashId, setSavingCashId] = useState<string | null>(null)
  const [luongPaid, setLuongPaid] = useState(props.luongPaid)
  const [bhxhPaid,  setBhxhPaid]  = useState(props.bhxhPaid)
  const [opexPaid,  setOpexPaid]  = useState(props.opexPaid)
  const [savingPayroll, setSavingPayroll] = useState(false)
  const [openingInput, setOpeningInput] = useState(
    props.openingBalance !== null ? String(props.openingBalance) : ''
  )
  const [editingOpening, setEditingOpening] = useState(props.openingBalance === null)
  const [savingOpening, setSavingOpening] = useState(false)

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects])

  const totalBankIn    = revenue.reduce((s, r) => s + r.amount, 0)
  const paidBankTx     = transactions.filter(t => bankTxMap.get(t.id))
  const pendingBankTx  = transactions.filter(t => !bankTxMap.get(t.id))
  const totalPaidBankTx = paidBankTx.reduce((s, t) => s + t.amount + t.vat_amount, 0)
  const totalPayroll   = payrollTongLuong
  const totalBhxh      = payrollBhxhNLD + payrollBhxhCTY
  const totalOpex      = opexCosts.reduce((s, o) => s + o.amount, 0)
  // Chỉ tính vào chi khi đã tick
  const paidPayroll = (luongPaid ? totalPayroll : 0) + (bhxhPaid ? totalBhxh : 0)
  const paidOpex    = opexPaid ? totalOpex : 0
  const totalBankOut   = totalPaidBankTx + paidPayroll + paidOpex

  const tmTxList    = cashTransactions.filter(t => cashTxSource.get(t.id) === 'tm')
  const tkCnTxList  = cashTransactions.filter(t => cashTxSource.get(t.id) === 'tk_cn')
  const untaggedTx  = cashTransactions.filter(t => !cashTxSource.get(t.id))
  const totalTmIn   = revenueTm.reduce((s, r) => s + r.amount, 0)
  const totalTmOut  = tmTxList.filter(t => t.payment_status === 'paid').reduce((s, t) => s + t.amount, 0)
  const totalTkCnIn = revenueTkCn.reduce((s, r) => s + r.amount, 0)
  const totalTkCnOut = tkCnTxList.filter(t => t.payment_status === 'paid').reduce((s, t) => s + t.amount, 0)

  const opening    = parseInt(openingInput.replace(/[^\d-]/g, '') || '0', 10)
  const closingBank = opening + totalBankIn - totalBankOut

  async function toggleBankPaid(tx: TxRow) {
    const nowPaid = !bankTxMap.get(tx.id)
    setSavingBankId(tx.id)
    setBankTxMap(prev => new Map(prev).set(tx.id, nowPaid))
    await supabase.from('transactions').update({
      bank_paid: nowPaid,
      bank_paid_date: nowPaid ? new Date().toISOString().split('T')[0] : null,
      payment_status: nowPaid ? 'paid' : 'pending',
    }).eq('id', tx.id)
    setSavingBankId(null)
    router.refresh()
  }

  // Insert-or-update helper — chỉ update đúng cột chỉ định, không overwrite cột khác
  async function saveBalanceSetting(updates: Record<string, unknown>) {
    const { data: existing } = await supabase
      .from('bank_balance_settings')
      .select('id')
      .eq('month', month)
      .eq('year', year)
      .maybeSingle()
    if (existing) {
      await supabase.from('bank_balance_settings')
        .update(updates)
        .eq('month', month).eq('year', year)
    } else {
      await supabase.from('bank_balance_settings')
        .insert({ month, year, ...updates })
    }
  }

  async function savePayrollTick(field: 'luong_paid' | 'bhxh_paid' | 'opex_paid', val: boolean) {
    setSavingPayroll(true)
    await saveBalanceSetting({ [field]: val })
    setSavingPayroll(false)
  }

  async function setCashSource(tx: TxRow, source: string) {
    setSavingCashId(tx.id)
    setCashTxSource(prev => new Map(prev).set(tx.id, source))
    await supabase.from('transactions').update({ payment_source: source || null }).eq('id', tx.id)
    setSavingCashId(null)
  }

  async function saveOpening() {
    setSavingOpening(true)
    const amount = parseInt(openingInput.replace(/[^\d-]/g, '') || '0', 10)
    await saveBalanceSetting({ opening_balance: amount })
    setEditingOpening(false)
    setSavingOpening(false)
    router.refresh()
  }

  function navigate(delta: number) {
    let m = month + delta, y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1)  { m = 12; y-- }
    router.push(`/ceo/cashflow?month=${m}&year=${y}`)
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dòng tiền</h1>
          <p className="text-sm text-gray-400">TK Công ty · TK Cá nhân · Tiền mặt</p>
        </div>
        <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl px-1">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronLeft size={16}/></button>
          <span className="text-sm font-semibold text-gray-800 px-2 min-w-[120px] text-center">{MONTH_VN[month]} {year}</span>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronRight size={16}/></button>
        </div>
      </div>

      {/* 3-channel summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* TK Công ty — dark */}
        <div className="bg-gray-900 rounded-2xl p-4">
          <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-3">🏦 TK Công ty</p>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-500">Số dư đầu tháng</p>
              {editingOpening ? (
                <div className="flex items-center gap-1">
                  <input type="number" value={openingInput} onChange={e => setOpeningInput(e.target.value)}
                    className="w-24 bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:outline-none focus:border-blue-500"/>
                  <button onClick={saveOpening} disabled={savingOpening}
                    className="p-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"><Check size={10}/></button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-gray-300 tabular-nums">{formatVND(opening)}</p>
                  <button onClick={() => setEditingOpening(true)} className="text-gray-600 hover:text-gray-400"><Pencil size={10}/></button>
                </div>
              )}
            </div>
            <div className="flex justify-between"><p className="text-xs text-gray-500">+ Thu vào</p><p className="text-xs text-green-400 tabular-nums">+{formatVND(totalBankIn)}</p></div>
            <div className="flex justify-between"><p className="text-xs text-gray-500">− Chi UNC</p><p className="text-xs text-red-400 tabular-nums">−{formatVND(totalBankOut)}</p></div>
            <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between items-baseline">
              <p className="text-xs text-gray-400">Số dư cuối</p>
              <p className={`text-base font-bold tabular-nums ${closingBank >= 0 ? 'text-blue-300' : 'text-red-400'}`}>{formatVND(closingBank)}</p>
            </div>
          </div>
        </div>

        {/* TK Cá nhân — white/purple */}
        <div className="bg-white border-2 border-purple-200 rounded-2xl p-4">
          <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider mb-3">💳 TK Cá nhân</p>
          <div className="space-y-1.5">
            <div className="flex justify-between"><p className="text-xs text-gray-500">+ Thu vào</p><p className="text-xs text-green-600 tabular-nums">+{formatVND(totalTkCnIn)}</p></div>
            <div className="flex justify-between"><p className="text-xs text-gray-500">− Chi ra</p><p className="text-xs text-red-500 tabular-nums">−{formatVND(totalTkCnOut)}</p></div>
            <div className="border-t border-purple-100 pt-2 mt-1 flex justify-between items-baseline">
              <p className="text-xs text-gray-400">Ròng tháng</p>
              <p className={`text-base font-bold tabular-nums ${totalTkCnIn - totalTkCnOut >= 0 ? 'text-purple-600' : 'text-red-500'}`}>{formatVND(totalTkCnIn - totalTkCnOut)}</p>
            </div>
          </div>
        </div>

        {/* Tiền mặt — white/amber */}
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-4">
          <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-3">💵 Tiền mặt</p>
          <div className="space-y-1.5">
            <div className="flex justify-between"><p className="text-xs text-gray-500">+ Thu vào</p><p className="text-xs text-green-600 tabular-nums">+{formatVND(totalTmIn)}</p></div>
            <div className="flex justify-between"><p className="text-xs text-gray-500">− Chi ra</p><p className="text-xs text-red-500 tabular-nums">−{formatVND(totalTmOut)}</p></div>
            <div className="border-t border-amber-100 pt-2 mt-1 flex justify-between items-baseline">
              <p className="text-xs text-gray-400">Ròng tháng</p>
              <p className={`text-base font-bold tabular-nums ${totalTmIn - totalTmOut >= 0 ? 'text-amber-600' : 'text-red-500'}`}>{formatVND(totalTmIn - totalTmOut)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== TK CÔNG TY — CHI TIẾT ===== */}
      <SectionTitle>🏦 TK Công ty — Chi tiết</SectionTitle>

      <Section title="THU VÀO — Doanh thu CK vào TK Công ty" color="green" total={totalBankIn}>
        {revenue.length === 0 ? <EmptyRow text="Chưa có doanh thu TK Công ty tháng này"/>
          : revenue.map(r => <RevenueItem key={r.id} r={r} projectName={projectMap.get(r.project_id) ?? '—'}/>)}
      </Section>

      <Section title={`CHI CÔNG TRÌNH — Chờ UNC (${pendingBankTx.length})`} color="orange"
        total={pendingBankTx.reduce((s,t) => s + t.amount + t.vat_amount, 0)} badge="Chưa TT">
        {pendingBankTx.length === 0 ? <EmptyRow text="Đã UNC hết các khoản VAT / HĐ nhân công"/>
          : pendingBankTx.map(t => <BankTxRow key={t.id} tx={t} projectName={projectMap.get(t.project_id) ?? '—'}
              paid={false} saving={savingBankId === t.id} onToggle={() => toggleBankPaid(t)}/>)}
      </Section>

      {paidBankTx.length > 0 && (
        <Section title={`CHI CÔNG TRÌNH — Đã UNC (${paidBankTx.length})`} color="blue" total={totalPaidBankTx} badge="Đã TT">
          {paidBankTx.map(t => <BankTxRow key={t.id} tx={t} projectName={projectMap.get(t.project_id) ?? '—'}
            paid={true} saving={savingBankId === t.id} onToggle={() => toggleBankPaid(t)}/>)}
        </Section>
      )}

      {/* Lương + BHXH — có tick */}
      <div className="bg-white rounded-2xl border border-purple-200 overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between bg-purple-50">
          <span className="text-xs font-bold uppercase tracking-wide text-purple-700">CHI LƯƠNG + BHXH</span>
          <span className="text-sm font-bold text-red-600 tabular-nums">−{formatVND(totalPayroll + totalBhxh)}</span>
        </div>
        {payrollTongLuong === 0 ? <EmptyRow text="Chưa có dữ liệu bảng lương tháng này"/> : <>
          <PayrollTickRow
            label={`Lương nhân viên ${MONTH_VN[month]}`} amount={payrollTongLuong}
            paid={luongPaid} saving={savingPayroll}
            onToggle={() => { setLuongPaid(v => { savePayrollTick('luong_paid', !v); return !v }) }}
          />
          <PayrollTickRow
            label="BHXH NLĐ (10.5%) + CTY (21.5%)" amount={totalBhxh}
            paid={bhxhPaid} saving={savingPayroll}
            onToggle={() => { setBhxhPaid(v => { savePayrollTick('bhxh_paid', !v); return !v }) }}
          />
        </>}
      </div>

      {/* OPEX — có tick */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between bg-gray-50">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-600">CHI VẬN HÀNH (OPEX)</span>
          <span className="text-sm font-bold text-red-600 tabular-nums">−{formatVND(totalOpex)}</span>
        </div>
        {opexCosts.length === 0 ? <EmptyRow text="Chưa có dữ liệu vận hành tháng này"/> :
          <PayrollTickRow
            label={`OPEX cố định ${MONTH_VN[month]} (${opexCosts.length} khoản)`} amount={totalOpex}
            paid={opexPaid} saving={savingPayroll}
            onToggle={() => { setOpexPaid(v => { savePayrollTick('opex_paid', !v); return !v }) }}
          />
        }
      </div>

      {/* ===== TM / TKCN — CHI TIẾT ===== */}
      <SectionTitle>💳 TK Cá nhân + 💵 Tiền mặt — Chi tiết</SectionTitle>

      {untaggedTx.length > 0 && (
        <Section title={`CHI CÔNG TRÌNH — Cần chọn kênh (${untaggedTx.length})`} color="yellow"
          total={untaggedTx.reduce((s,t) => s + t.amount, 0)} badge="Chưa gán">
          {untaggedTx.map(t => <CashTxRow key={t.id} tx={t} projectName={projectMap.get(t.project_id) ?? '—'}
            source={cashTxSource.get(t.id) ?? ''} saving={savingCashId === t.id}
            onSetSource={s => setCashSource(t, s)}/>)}
        </Section>
      )}

      {(totalTkCnIn > 0 || tkCnTxList.length > 0) && (
        <Section title={`CHI — TK Cá nhân (${tkCnTxList.length})`} color="purple2" total={totalTkCnOut}>
          {revenueTkCn.map(r => <RevenueItem key={r.id} r={r} projectName={projectMap.get(r.project_id) ?? '—'} incoming/>)}
          {tkCnTxList.map(t => <CashTxRow key={t.id} tx={t} projectName={projectMap.get(t.project_id) ?? '—'}
            source="tk_cn" saving={savingCashId === t.id} onSetSource={s => setCashSource(t, s)}/>)}
        </Section>
      )}

      {(totalTmIn > 0 || tmTxList.length > 0) && (
        <Section title={`CHI — Tiền mặt (${tmTxList.length})`} color="amber" total={totalTmOut}>
          {revenueTm.map(r => <RevenueItem key={r.id} r={r} projectName={projectMap.get(r.project_id) ?? '—'} incoming/>)}
          {tmTxList.map(t => <CashTxRow key={t.id} tx={t} projectName={projectMap.get(t.project_id) ?? '—'}
            source="tm" saving={savingCashId === t.id} onSetSource={s => setCashSource(t, s)}/>)}
        </Section>
      )}
    </div>
  )
}

/* ===== Sub-components ===== */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-1">{children}</p>
}

function Section({ title, color, total, badge, children }: {
  title: string; color: string; total: number; badge?: string; children: React.ReactNode
}) {
  const map: Record<string, { border: string; head: string; amt: string; sign: string }> = {
    green:   { border: 'border-green-200',  head: 'bg-green-50 text-green-700',   amt: 'text-green-700', sign: '+' },
    orange:  { border: 'border-orange-200', head: 'bg-orange-50 text-orange-700', amt: 'text-red-600',   sign: '−' },
    blue:    { border: 'border-blue-200',   head: 'bg-blue-50 text-blue-700',     amt: 'text-red-600',   sign: '−' },
    purple2: { border: 'border-purple-200', head: 'bg-purple-50 text-purple-700', amt: 'text-red-600',   sign: '−' },
    yellow:  { border: 'border-yellow-300', head: 'bg-yellow-50 text-yellow-800', amt: 'text-orange-600',sign: '?' },
    amber:   { border: 'border-amber-200',  head: 'bg-amber-50 text-amber-800',   amt: 'text-red-600',   sign: '−' },
  }
  const s = map[color] ?? map.amber
  return (
    <div className={`bg-white rounded-2xl border ${s.border} overflow-hidden`}>
      <div className={`px-4 py-2.5 flex items-center justify-between ${s.head}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
          {badge && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              badge === 'Đã TT' ? 'bg-green-100 text-green-700' :
              badge === 'Chưa TT' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
            }`}>{badge}</span>
          )}
        </div>
        <span className={`text-sm font-bold tabular-nums ${s.amt}`}>{s.sign}{formatVND(total)}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}

function PayrollTickRow({ label, amount, paid, saving, onToggle }: {
  label: string; amount: number; paid: boolean; saving: boolean; onToggle: () => void
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 ${paid ? 'opacity-70' : ''}`}>
      <button onClick={onToggle} disabled={saving}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 ${
          paid ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-purple-500'}`}>
        {paid && <Check size={11} className="text-white"/>}
      </button>
      <div className="flex-1">
        <p className="text-sm text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">{paid ? 'Đã chuyển khoản' : 'Chưa chuyển — tick khi đã CK'}</p>
      </div>
      <p className="text-sm font-semibold text-red-600 tabular-nums">−{formatVND(amount)}</p>
    </div>
  )
}

function RevenueItem({ r, projectName, incoming }: {
  r: { id: string; stage: string; amount: number; collected_date: string | null; project_id: string }
  projectName: string; incoming?: boolean
}) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0">
      <div className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${incoming ? 'bg-green-400' : 'bg-blue-400'}`}/>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{r.stage}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Building2 size={10}/>{projectName}
          {r.collected_date && ` · ${new Date(r.collected_date).toLocaleDateString('vi-VN')}`}
        </p>
      </div>
      <p className="text-sm font-semibold text-green-700 tabular-nums">+{formatVND(r.amount)}</p>
    </div>
  )
}

function BankTxRow({ tx, projectName, paid, saving, onToggle }: {
  tx: TxRow; projectName: string; paid: boolean; saving: boolean; onToggle: () => void
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${paid ? 'opacity-60' : ''}`}>
      <button onClick={onToggle} disabled={saving}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 ${
          paid ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-blue-500'}`}>
        {paid && <Check size={11} className="text-white"/>}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {tx.description || tx.supplier || '—'}
          {tx.supplier && tx.description && <span className="text-gray-400 font-normal"> · {tx.supplier}</span>}
        </p>
        <p className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
          <Building2 size={10}/>{projectName} · {new Date(tx.transaction_date).toLocaleDateString('vi-VN')}
          {tx.vat_amount > 0 && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-semibold">VAT</span>}
          {tx.tncn_amount > 0 && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[9px] font-semibold">HĐ NC</span>}
        </p>
        {tx.vat_amount > 0 && <p className="text-[10px] text-gray-400 mt-0.5">Gốc: {formatVND(tx.amount)} + VAT: {formatVND(tx.vat_amount)}</p>}
        {tx.tncn_amount > 0 && <p className="text-[10px] text-orange-400 mt-0.5">TNCN nộp sau: {formatVND(tx.tncn_amount)}</p>}
      </div>
      <p className="text-sm font-semibold text-red-600 tabular-nums flex-shrink-0">−{formatVND(tx.amount + tx.vat_amount)}</p>
    </div>
  )
}

function CashTxRow({ tx, projectName, source, saving, onSetSource }: {
  tx: TxRow; projectName: string; source: string; saving: boolean; onSetSource: (s: string) => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
      <select value={source} onChange={e => onSetSource(e.target.value)} disabled={saving}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 flex-shrink-0">
        <option value="">— kênh —</option>
        <option value="tk_cn">💳 TKCN</option>
        <option value="tm">💵 TM</option>
      </select>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {tx.description || tx.supplier || '—'}
          {tx.supplier && tx.description && <span className="text-gray-400 font-normal"> · {tx.supplier}</span>}
        </p>
        <p className="text-xs text-gray-400 flex items-center gap-2">
          <Building2 size={10}/>{projectName} · {new Date(tx.transaction_date).toLocaleDateString('vi-VN')}
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
            tx.payment_status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
            {tx.payment_status === 'paid' ? 'Đã TT' : 'Chưa TT'}
          </span>
        </p>
      </div>
      <p className="text-sm font-semibold text-red-600 tabular-nums flex-shrink-0">−{formatVND(tx.amount)}</p>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-4 py-4 text-xs text-gray-400 italic">{text}</p>
}
