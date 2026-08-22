'use client'

import { useState } from 'react'
import { formatVND, formatVNDShort } from '@/lib/utils'
import { Plus, Trash2, Pencil, Settings2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const CATEGORY_OPTIONS = ['Sinh hoạt', 'Ăn uống', 'Di chuyển', 'Nhà ở', 'Giáo dục', 'Sức khoẻ', 'Khác']
const CHANNEL_LABEL: Record<string, string> = {
  tk_cty: 'TK Công ty', tm: 'Tiền mặt',
  tk_cn: 'TK Cá nhân', // legacy
}
const CHANNEL_STYLE: Record<string, string> = {
  tk_cty: 'bg-blue-100 text-blue-700',
  tm:     'bg-orange-100 text-orange-700',
  tk_cn:  'bg-purple-100 text-purple-700',
}
// Màu xoay vòng cho các ngân hàng con do Sếp tự thêm — không hardcode theo tên cụ thể
const BANK_COLOR_CYCLE = [
  { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-600', textDark: 'text-indigo-800', badge: 'bg-indigo-100 text-indigo-700' },
  { bg: 'bg-teal-50',   border: 'border-teal-100',   text: 'text-teal-600',   textDark: 'text-teal-800',   badge: 'bg-teal-100 text-teal-700' },
  { bg: 'bg-sky-50',    border: 'border-sky-100',    text: 'text-sky-600',    textDark: 'text-sky-800',    badge: 'bg-sky-100 text-sky-700' },
  { bg: 'bg-fuchsia-50',border: 'border-fuchsia-100',text: 'text-fuchsia-600',textDark: 'text-fuchsia-800',badge: 'bg-fuchsia-100 text-fuchsia-700' },
  { bg: 'bg-lime-50',   border: 'border-lime-100',   text: 'text-lime-600',   textDark: 'text-lime-800',   badge: 'bg-lime-100 text-lime-700' },
]

export interface BankChannel { id: string; code: string; label: string; sort_order: number }

interface PersonalExpense {
  id: string
  date: string
  description: string
  category: string
  channel: string
  amount: number
  notes?: string | null
}

interface PersonalLoan {
  id: string
  date: string
  description: string
  amount: number
  channel: string
  repaid_amount: number
  repaid_channel?: string | null
  repaid_date?: string | null
  notes?: string | null
}

// Nộp tiền cá nhân NGƯỢC vào quỹ công ty (thu nợ, hoàn tiền...) → cộng "Thu vào" của kênh
export interface ChannelDeposit {
  id: string
  date: string
  description: string
  channel: string
  amount: number
  notes?: string | null
}

const DEPOSIT_CHANNELS = [
  { value: 'tk_cn',  label: 'TK Cá nhân' },
  { value: 'tk_cty', label: 'TK Công ty' },
  { value: 'tm',     label: 'Tiền mặt' },
]

const INP = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none'
const LBL = 'block text-xs font-medium text-gray-600 mb-1'

export default function PersonalExpensesTab({
  initialExpenses,
  initialLoans,
  initialDeposits = [],
  initialBankChannels = [],
}: {
  initialExpenses: PersonalExpense[]
  initialLoans: PersonalLoan[]
  initialDeposits?: ChannelDeposit[]
  initialBankChannels?: BankChannel[]
}) {
  const [expenses, setExpenses] = useState(initialExpenses)
  const [loans, setLoans] = useState(initialLoans)
  const [deposits, setDeposits] = useState(initialDeposits)
  const [bankChannels, setBankChannels] = useState(initialBankChannels)
  const [filterMonth, setFilterMonth] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showAddLoan, setShowAddLoan] = useState(false)
  const [showAddDeposit, setShowAddDeposit] = useState(false)
  const [showManageBanks, setShowManageBanks] = useState(false)
  const [newBankLabel, setNewBankLabel] = useState('')
  const [depForm, setDepForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    channel: 'tk_cn',
    amount: '',
    notes: '',
  })
  const [repayingLoan, setRepayingLoan] = useState<PersonalLoan | null>(null)
  const [saving, setSaving] = useState(false)

  const [expForm, setExpForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'Sinh hoạt',
    channel: 'ocb',
    amount: '',
    notes: '',
  })
  const [loanForm, setLoanForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    channel: 'tk_cn',
    notes: '',
  })
  const [repayAmount, setRepayAmount] = useState('')
  const [repayChannel, setRepayChannel] = useState('tk_cn')
  const [repayDate, setRepayDate] = useState(new Date().toISOString().split('T')[0])
  const [editingExpense, setEditingExpense] = useState<PersonalExpense | null>(null)
  const [editForm, setEditForm] = useState({ date: '', description: '', category: 'Sinh hoạt', channel: 'tk_cn', amount: '', notes: '' })
  const [editingLoan, setEditingLoan] = useState<PersonalLoan | null>(null)
  const [loanEditForm, setLoanEditForm] = useState({ date: '', description: '', amount: '', channel: 'tk_cn', notes: '' })

  // Danh mục = chữ tự do trong DB — gộp danh sách mặc định + mọi danh mục đã từng dùng, để
  // Sếp bổ sung danh mục mới 1 lần là các lần sau tự có trong danh sách chọn.
  const allCategoryOptions = Array.from(new Set([...CATEGORY_OPTIONS, ...expenses.map(e => e.category)])).filter(Boolean)
  const [expCategoryCustom, setExpCategoryCustom] = useState(false)
  const [editCategoryCustom, setEditCategoryCustom] = useState(false)
  const NEW_CATEGORY = '__new__'

  // Bộ lọc bảng "Chi tiêu cá nhân" theo tháng + danh mục
  const allMonthOptions = Array.from(new Set(expenses.map(e => e.date.slice(0, 7)))).sort((a, b) => b.localeCompare(a))
  const filteredExpenses = expenses.filter(e => {
    if (filterMonth && e.date.slice(0, 7) !== filterMonth) return false
    if (filterCategory && e.category !== filterCategory) return false
    return true
  })
  const filteredExpTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0)

  const totalExp = expenses.reduce((s, e) => s + e.amount, 0)
  const sumCh = (ch: string) => expenses.filter(e => e.channel === ch).reduce((s, e) => s + e.amount, 0)
  const expByChannel: Record<string, number> = {
    tk_cty: sumCh('tk_cty'), tm: sumCh('tm'),
  }
  for (const b of bankChannels) expByChannel[b.code] = sumCh(b.code)
  const chLabel: Record<string, string> = { ...CHANNEL_LABEL, ...Object.fromEntries(bankChannels.map(b => [b.code, b.label])) }
  const chStyle: Record<string, string> = {
    ...CHANNEL_STYLE,
    ...Object.fromEntries(bankChannels.map((b, i) => [b.code, BANK_COLOR_CYCLE[i % BANK_COLOR_CYCLE.length].badge])),
  }
  const totalDebt = loans.reduce((s, l) => s + Math.max(0, l.amount - l.repaid_amount), 0)

  async function handleAddBankChannel() {
    if (!newBankLabel.trim()) return
    const code = newBankLabel.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!code) return
    if (bankChannels.some(b => b.code === code)) { alert('Ngân hàng này đã có trong danh sách.'); return }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('bank_channels')
      .insert({ code, label: newBankLabel.trim(), sort_order: bankChannels.length + 1 })
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setBankChannels(prev => [...prev, data as BankChannel])
      setNewBankLabel('')
    } else if (error) {
      alert('Lỗi thêm ngân hàng:\n' + error.message)
    }
  }

  async function handleDeleteBankChannel(id: string, code: string) {
    const inUse = expenses.some(e => e.channel === code)
    if (inUse && !confirm('Ngân hàng này đang có khoản chi gắn với nó. Xóa khỏi danh sách chọn (không xóa lịch sử chi cũ)?')) return
    const supabase = createClient()
    const { error } = await supabase.from('bank_channels').delete().eq('id', id)
    if (!error) setBankChannels(prev => prev.filter(b => b.id !== id))
    else alert('Lỗi xóa:\n' + error.message)
  }

  async function handleAddExpense() {
    if (!expForm.description || !expForm.amount) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('personal_expenses')
      .insert({
        date: expForm.date,
        description: expForm.description,
        category: expForm.category,
        channel: expForm.channel,
        amount: parseFloat(expForm.amount),
        notes: expForm.notes || null,
      })
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setExpenses([data as PersonalExpense, ...expenses])
      setShowAddExpense(false)
      setExpForm({ date: new Date().toISOString().split('T')[0], description: '', category: 'Sinh hoạt', channel: 'tk_cn', amount: '', notes: '' })
    } else if (error) {
      console.error('Add expense error:', error)
      alert('Lỗi lưu khoản chi:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : '') + (error.hint ? `\nHint: ${error.hint}` : ''))
    }
  }

  async function handleDeleteExpense(id: string, desc: string) {
    if (!confirm(`Xóa khoản chi "${desc}"?`)) return
    const supabase = createClient()
    await supabase.from('personal_expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  function openEditExpense(e: PersonalExpense) {
    setEditForm({ date: e.date, description: e.description, category: e.category, channel: e.channel, amount: String(e.amount), notes: e.notes ?? '' })
    setEditCategoryCustom(!allCategoryOptions.includes(e.category))
    setEditingExpense(e)
  }

  async function handleUpdateExpense() {
    if (!editingExpense || !editForm.description || !editForm.amount) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('personal_expenses')
      .update({
        date: editForm.date,
        description: editForm.description,
        category: editForm.category,
        channel: editForm.channel,
        amount: parseFloat(editForm.amount),
        notes: editForm.notes || null,
      })
      .eq('id', editingExpense.id)
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setExpenses(prev => prev.map(x => x.id === editingExpense.id ? (data as PersonalExpense) : x))
      setEditingExpense(null)
    } else if (error) {
      alert('Lỗi cập nhật khoản chi:\n' + (error.message ?? ''))
    }
  }

  async function handleAddLoan() {
    if (!loanForm.description || !loanForm.amount) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('personal_loans')
      .insert({
        date: loanForm.date,
        description: loanForm.description,
        amount: parseFloat(loanForm.amount),
        channel: loanForm.channel,
        repaid_amount: 0,
        notes: loanForm.notes || null,
      })
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setLoans([data as PersonalLoan, ...loans])
      setShowAddLoan(false)
      setLoanForm({ date: new Date().toISOString().split('T')[0], description: '', amount: '', channel: 'tk_cn', notes: '' })
    } else if (error) {
      console.error('Add loan error:', error)
      alert('Lỗi ghi khoản mượn:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
    }
  }

  function openEditLoan(l: PersonalLoan) {
    setLoanEditForm({ date: l.date, description: l.description, amount: String(l.amount), channel: l.channel ?? 'tk_cn', notes: l.notes ?? '' })
    setEditingLoan(l)
  }

  async function handleUpdateLoan() {
    if (!editingLoan || !loanEditForm.description || !loanEditForm.amount) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('personal_loans')
      .update({
        date: loanEditForm.date,
        description: loanEditForm.description,
        amount: parseFloat(loanEditForm.amount),
        channel: loanEditForm.channel,
        notes: loanEditForm.notes || null,
      })
      .eq('id', editingLoan.id)
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setLoans(prev => prev.map(x => x.id === editingLoan.id ? (data as PersonalLoan) : x))
      setEditingLoan(null)
    } else if (error) {
      alert('Lỗi cập nhật khoản mượn:\n' + (error.message ?? ''))
    }
  }

  async function handleRepay() {
    if (!repayingLoan || !repayAmount) return
    const add = parseFloat(repayAmount)
    if (isNaN(add) || add <= 0) return
    setSaving(true)
    const supabase = createClient()
    const newRepaid = (repayingLoan.repaid_amount ?? 0) + add
    const { error } = await supabase
      .from('personal_loans')
      .update({ repaid_amount: newRepaid, repaid_channel: repayChannel, repaid_date: repayDate })
      .eq('id', repayingLoan.id)
    setSaving(false)
    if (!error) {
      setLoans(prev => prev.map(l => l.id === repayingLoan.id ? { ...l, repaid_amount: newRepaid, repaid_channel: repayChannel, repaid_date: repayDate } : l))
      setRepayingLoan(null)
      setRepayAmount('')
    }
  }

  async function handleDeleteLoan(id: string, desc: string) {
    if (!confirm(`Xóa khoản mượn "${desc}"?`)) return
    const supabase = createClient()
    await supabase.from('personal_loans').delete().eq('id', id)
    setLoans(prev => prev.filter(l => l.id !== id))
  }

  async function handleAddDeposit() {
    if (!depForm.description || !depForm.amount) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('channel_deposits')
      .insert({
        date: depForm.date,
        description: depForm.description,
        channel: depForm.channel,
        amount: parseFloat(depForm.amount),
        notes: depForm.notes || null,
      })
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setDeposits([data as ChannelDeposit, ...deposits])
      setShowAddDeposit(false)
      setDepForm({ date: new Date().toISOString().split('T')[0], description: '', channel: 'tk_cn', amount: '', notes: '' })
    } else if (error) {
      alert('Lỗi ghi khoản nộp:\n' + (error.message ?? '') + (error.code ? `\n[${error.code}]` : ''))
    }
  }

  async function handleDeleteDeposit(id: string, desc: string) {
    if (!confirm(`Xóa khoản nộp "${desc}"?`)) return
    const supabase = createClient()
    await supabase.from('channel_deposits').delete().eq('id', id)
    setDeposits(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => setShowManageBanks(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <Settings2 size={12} /> Quản lý ngân hàng
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-xs text-red-600 font-medium mb-1">Tổng chi cá nhân</p>
          <p className="text-lg font-bold text-red-800 tabular-nums">{formatVNDShort(totalExp)}</p>
        </div>
        {bankChannels.map((b, i) => {
          const c = BANK_COLOR_CYCLE[i % BANK_COLOR_CYCLE.length]
          return (
            <div key={b.id} className={`${c.bg} border ${c.border} rounded-xl p-3`}>
              <p className={`text-xs ${c.text} font-medium mb-1`}>{b.label}</p>
              <p className={`text-base font-bold ${c.textDark} tabular-nums`}>{formatVNDShort(expByChannel[b.code] ?? 0)}</p>
            </div>
          )
        })}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p className="text-xs text-blue-600 font-medium mb-1">TK Công ty</p>
          <p className="text-base font-bold text-blue-800 tabular-nums">{formatVNDShort(expByChannel.tk_cty)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
          <p className="text-xs text-orange-600 font-medium mb-1">Tiền mặt</p>
          <p className="text-base font-bold text-orange-800 tabular-nums">{formatVNDShort(expByChannel.tm)}</p>
        </div>
      </div>

      {totalDebt > 0 && (
        <div className="bg-amber-100 border border-amber-300 rounded-xl px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Công ty đang nợ Sếp</p>
            <p className="text-[11px] text-amber-700 mt-0.5">Tổng khoản mượn chưa hoàn trả</p>
          </div>
          <p className="text-xl font-black text-orange-600 tabular-nums">{formatVNDShort(totalDebt)}</p>
        </div>
      )}

      {/* Personal expenses table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Chi tiêu cá nhân</h3>
            <p className="text-xs text-gray-500 mt-0.5">Sinh hoạt, di chuyển, nhà ở và các chi phí khác</p>
          </div>
          <button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus size={13} />
            Thêm khoản chi
          </button>
        </div>

        {/* Filter theo tháng + danh mục */}
        <div className="px-5 py-2.5 bg-gray-50/60 border-b border-gray-200 flex flex-wrap items-center gap-2">
          <select
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
            value={filterMonth}
            onChange={ev => setFilterMonth(ev.target.value)}
          >
            <option value="">Tất cả tháng</option>
            {allMonthOptions.map(m => {
              const [y, mo] = m.split('-')
              return <option key={m} value={m}>Tháng {parseInt(mo)}/{y}</option>
            })}
          </select>
          <select
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
            value={filterCategory}
            onChange={ev => setFilterCategory(ev.target.value)}
          >
            <option value="">Tất cả danh mục</option>
            {allCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(filterMonth || filterCategory) && (
            <button
              onClick={() => { setFilterMonth(''); setFilterCategory('') }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Xóa lọc
            </button>
          )}
          <span className="ml-auto text-xs text-gray-500">
            {filteredExpenses.length} khoản · Tổng:{' '}
            <span className="font-bold text-gray-900 tabular-nums">{formatVND(filteredExpTotal)}</span>
          </span>
        </div>

        {expenses.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-400 text-center italic">Chưa có khoản chi nào.</p>
        ) : filteredExpenses.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-400 text-center italic">Không có khoản chi nào khớp bộ lọc.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 font-medium">Ngày</th>
                  <th className="text-left px-5 py-2.5 font-medium">Mô tả</th>
                  <th className="text-left px-4 py-2.5 font-medium">Danh mục</th>
                  <th className="text-left px-4 py-2.5 font-medium">Kênh rút</th>
                  <th className="text-right px-5 py-2.5 font-medium">Số tiền</th>
                  <th className="px-3 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredExpenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 group">
                    <td className="px-5 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                      {new Date(e.date + 'T00:00:00').toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-5 py-3 text-gray-900 font-medium">
                      {e.description}
                      {e.notes && <span className="ml-1.5 text-xs text-gray-400">({e.notes})</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${chStyle[e.channel] ?? 'bg-gray-100 text-gray-600'}`}>
                        {chLabel[e.channel] ?? e.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatVND(e.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditExpense(e)}
                          className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Sửa"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(e.id, e.description)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded"
                          title="Xóa"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Loan tracker */}
      <div className="bg-amber-50 rounded-xl overflow-hidden border border-amber-200">
        <div className="px-5 py-3 bg-amber-100 border-b border-amber-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Mượn tiền cá nhân → Công ty</h3>
            <p className="text-[11px] text-amber-700 mt-0.5">Sếp ứng tiền vào công ty — ghi nợ để theo dõi hoàn trả</p>
          </div>
          <button
            onClick={() => setShowAddLoan(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-400 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-200/60 transition-colors"
          >
            <Plus size={13} />
            Ghi khoản mượn
          </button>
        </div>
        {loans.length === 0 ? (
          <p className="px-5 py-10 text-sm text-amber-700 text-center italic">Chưa có khoản mượn nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-amber-700 border-b border-amber-200">
                  <th className="text-left px-5 py-2.5 font-medium">Ngày mượn</th>
                  <th className="text-left px-5 py-2.5 font-medium">Mục đích</th>
                  <th className="text-left px-4 py-2.5 font-medium">Kênh nhận</th>
                  <th className="text-right px-4 py-2.5 font-medium">Số tiền mượn</th>
                  <th className="text-right px-4 py-2.5 font-medium">Đã trả lại</th>
                  <th className="text-right px-5 py-2.5 font-medium">Còn nợ</th>
                  <th className="text-left px-4 py-2.5 font-medium">Trạng thái</th>
                  <th className="px-3 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {loans.map(l => {
                  const remaining = Math.max(0, l.amount - l.repaid_amount)
                  const settled = remaining <= 0
                  const partial = !settled && l.repaid_amount > 0
                  return (
                    <tr key={l.id} className="group hover:bg-amber-100/40">
                      <td className="px-5 py-3 text-amber-700 text-xs tabular-nums whitespace-nowrap">
                        {new Date(l.date + 'T00:00:00').toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-5 py-3 text-amber-950 font-medium">
                        {l.description}
                        {l.notes && <span className="ml-1.5 text-xs text-amber-700">({l.notes})</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${chStyle[l.channel] ?? 'bg-amber-200 text-amber-800'}`}>
                          {chLabel[l.channel] ?? l.channel ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-amber-800 tabular-nums text-xs whitespace-nowrap">
                        {formatVND(l.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-700 tabular-nums text-xs whitespace-nowrap">
                        {formatVND(l.repaid_amount)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                        <span className={settled ? 'text-green-700' : 'text-orange-600'}>
                          {formatVND(remaining)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          settled ? 'bg-green-100 text-green-700' :
                          partial  ? 'bg-amber-200 text-amber-800' :
                                     'bg-red-100 text-red-700'
                        }`}>
                          {settled ? 'Đã hoàn' : partial ? 'Chưa đủ' : 'Chưa trả'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          {!settled && (
                            <button
                              onClick={() => { setRepayingLoan(l); setRepayAmount(''); setRepayChannel(l.channel ?? 'tk_cn'); setRepayDate(new Date().toISOString().split('T')[0]) }}
                              className="px-2 py-1 text-[10px] text-amber-800 border border-amber-400 rounded hover:bg-amber-200/60 whitespace-nowrap"
                            >
                              Ghi trả
                            </button>
                          )}
                          <button
                            onClick={() => openEditLoan(l)}
                            className="p-1 text-amber-600 hover:text-blue-600 rounded"
                            title="Sửa"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteLoan(l.id, l.description)}
                            className="p-1 text-amber-600 hover:text-red-600 rounded"
                            title="Xóa"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {loans.length > 0 && (
          <div className="px-5 py-3 border-t border-amber-200 flex items-center justify-between">
            <span className="text-xs text-amber-700 font-medium">Tổng đang nợ Sếp</span>
            <span className={`text-lg font-black tabular-nums ${totalDebt > 0 ? 'text-orange-600' : 'text-green-700'}`}>
              {formatVNDShort(totalDebt)}
            </span>
          </div>
        )}
      </div>

      {/* Nộp ngược tiền cá nhân vào quỹ công ty */}
      <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
        <div className="px-5 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-green-800">Nộp ngược vào quỹ công ty</h3>
            <p className="text-[11px] text-green-600 mt-0.5">Thu nợ, hoàn tiền, tiền cá nhân nộp vào — cộng vào &quot;Thu vào&quot; của kênh (không phải doanh thu)</p>
          </div>
          <button
            onClick={() => setShowAddDeposit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-green-300 text-green-700 text-xs font-medium rounded-lg hover:bg-green-50 transition-colors"
          >
            <Plus size={13} /> Ghi khoản nộp
          </button>
        </div>
        {deposits.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center italic">Chưa có khoản nộp nào.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {deposits.map(d => (
              <div key={d.id} className="px-5 py-3 flex items-center gap-3 group hover:bg-gray-50/50">
                <span className="text-xs text-gray-400 tabular-nums w-20 shrink-0">
                  {new Date(d.date + 'T00:00:00').toLocaleDateString('vi-VN')}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800">{d.description}</span>
                  <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${chStyle[d.channel] ?? 'bg-gray-100 text-gray-600'}`}>
                    {chLabel[d.channel] ?? d.channel}
                  </span>
                  {d.notes && <span className="ml-1.5 text-xs text-gray-400">· {d.notes}</span>}
                </div>
                <span className="text-sm font-semibold text-green-700 tabular-nums whitespace-nowrap">+{formatVND(d.amount)}</span>
                <button onClick={() => handleDeleteDeposit(d.id, d.description)}
                  className="p-1 text-gray-300 hover:text-red-500 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {deposits.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">Tổng nộp vào quỹ</span>
            <span className="text-lg font-black text-green-700 tabular-nums">
              +{formatVNDShort(deposits.reduce((s, d) => s + d.amount, 0))}
            </span>
          </div>
        )}
      </div>

      {/* Modal: Add Deposit */}
      {showAddDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Nộp ngược vào quỹ công ty</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Ngày nộp</label>
                  <input type="date" className={INP} value={depForm.date}
                    onChange={ev => setDepForm(f => ({ ...f, date: ev.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Số tiền (₫)</label>
                  <input type="number" min="0" className={INP} placeholder="0" value={depForm.amount}
                    onChange={ev => setDepForm(f => ({ ...f, amount: ev.target.value }))} />
                </div>
              </div>
              <div>
                <label className={LBL}>Nội dung</label>
                <input className={INP} placeholder="VD: Bạn trả nợ, hoàn tiền tạm ứng..." value={depForm.description}
                  onChange={ev => setDepForm(f => ({ ...f, description: ev.target.value }))} />
              </div>
              <div>
                <label className={LBL}>Nộp vào kênh</label>
                <select className={INP} value={depForm.channel}
                  onChange={ev => setDepForm(f => ({ ...f, channel: ev.target.value }))}>
                  {DEPOSIT_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Ghi chú</label>
                <input className={INP} value={depForm.notes}
                  onChange={ev => setDepForm(f => ({ ...f, notes: ev.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAddDeposit(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Huỷ</button>
              <button onClick={handleAddDeposit} disabled={saving || !depForm.description || !depForm.amount}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Expense */}
      {showAddExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Thêm khoản chi cá nhân</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Ngày chi</label>
                  <input type="date" className={INP} value={expForm.date}
                    onChange={ev => setExpForm(f => ({ ...f, date: ev.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Số tiền (₫)</label>
                  <input type="number" min="0" className={INP} placeholder="0" value={expForm.amount}
                    onChange={ev => setExpForm(f => ({ ...f, amount: ev.target.value }))} />
                </div>
              </div>
              <div>
                <label className={LBL}>Mô tả</label>
                <input type="text" className={INP} placeholder="VD: Tiền nhà tháng 7..." value={expForm.description}
                  onChange={ev => setExpForm(f => ({ ...f, description: ev.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Danh mục</label>
                  {expCategoryCustom ? (
                    <input type="text" autoFocus className={INP} placeholder="Nhập danh mục mới..." value={expForm.category}
                      onChange={ev => setExpForm(f => ({ ...f, category: ev.target.value }))}
                      onBlur={() => { if (!expForm.category.trim()) { setExpCategoryCustom(false); setExpForm(f => ({ ...f, category: 'Sinh hoạt' })) } }} />
                  ) : (
                    <select className={INP} value={expForm.category}
                      onChange={ev => {
                        if (ev.target.value === NEW_CATEGORY) { setExpCategoryCustom(true); setExpForm(f => ({ ...f, category: '' })) }
                        else setExpForm(f => ({ ...f, category: ev.target.value }))
                      }}>
                      {allCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value={NEW_CATEGORY}>+ Thêm danh mục mới...</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className={LBL}>Kênh rút</label>
                  <select className={INP} value={expForm.channel}
                    onChange={ev => setExpForm(f => ({ ...f, channel: ev.target.value }))}>
                    {bankChannels.map(b => <option key={b.id} value={b.code}>{b.label}</option>)}
                    <option value="tk_cty">TK Công ty</option>
                    <option value="tm">Tiền mặt</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={LBL}>Ghi chú (tuỳ chọn)</label>
                <input type="text" className={INP} value={expForm.notes}
                  onChange={ev => setExpForm(f => ({ ...f, notes: ev.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowAddExpense(false); setExpCategoryCustom(false) }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Huỷ
              </button>
              <button
                onClick={handleAddExpense}
                disabled={saving || !expForm.description || !expForm.amount}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Lưu khoản chi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Expense */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Sửa khoản chi cá nhân</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Ngày chi</label>
                  <input type="date" className={INP} value={editForm.date}
                    onChange={ev => setEditForm(f => ({ ...f, date: ev.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Số tiền (₫)</label>
                  <input type="number" min="0" className={INP} value={editForm.amount}
                    onChange={ev => setEditForm(f => ({ ...f, amount: ev.target.value }))} />
                </div>
              </div>
              <div>
                <label className={LBL}>Mô tả</label>
                <input type="text" className={INP} value={editForm.description}
                  onChange={ev => setEditForm(f => ({ ...f, description: ev.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Danh mục</label>
                  {editCategoryCustom ? (
                    <input type="text" autoFocus className={INP} placeholder="Nhập danh mục mới..." value={editForm.category}
                      onChange={ev => setEditForm(f => ({ ...f, category: ev.target.value }))}
                      onBlur={() => { if (!editForm.category.trim()) setEditCategoryCustom(false) }} />
                  ) : (
                    <select className={INP} value={editForm.category}
                      onChange={ev => {
                        if (ev.target.value === NEW_CATEGORY) { setEditCategoryCustom(true); setEditForm(f => ({ ...f, category: '' })) }
                        else setEditForm(f => ({ ...f, category: ev.target.value }))
                      }}>
                      {allCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value={NEW_CATEGORY}>+ Thêm danh mục mới...</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className={LBL}>Kênh rút</label>
                  <select className={INP} value={editForm.channel}
                    onChange={ev => setEditForm(f => ({ ...f, channel: ev.target.value }))}>
                    {bankChannels.map(b => <option key={b.id} value={b.code}>{b.label}</option>)}
                    <option value="tk_cty">TK Công ty</option>
                    <option value="tm">Tiền mặt</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={LBL}>Ghi chú (tuỳ chọn)</label>
                <input type="text" className={INP} value={editForm.notes}
                  onChange={ev => setEditForm(f => ({ ...f, notes: ev.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditingExpense(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Huỷ
              </button>
              <button onClick={handleUpdateExpense}
                disabled={saving || !editForm.description || !editForm.amount}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Loan */}
      {showAddLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Ghi khoản mượn</h2>
            <p className="text-xs text-gray-500 mb-4">Sếp ứng tiền cá nhân vào công ty — hệ thống ghi nợ để theo dõi hoàn trả</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Ngày mượn</label>
                  <input type="date" className={INP} value={loanForm.date}
                    onChange={ev => setLoanForm(f => ({ ...f, date: ev.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Số tiền mượn (₫)</label>
                  <input type="number" min="0" className={INP} placeholder="0" value={loanForm.amount}
                    onChange={ev => setLoanForm(f => ({ ...f, amount: ev.target.value }))} />
                </div>
              </div>
              <div>
                <label className={LBL}>Mục đích</label>
                <input type="text" className={INP} placeholder="VD: Bù đắp dòng tiền thanh toán NCC..." value={loanForm.description}
                  onChange={ev => setLoanForm(f => ({ ...f, description: ev.target.value }))} />
              </div>
              <div>
                <label className={LBL}>Mượn vào kênh</label>
                <select className={INP} value={loanForm.channel}
                  onChange={ev => setLoanForm(f => ({ ...f, channel: ev.target.value }))}>
                  {DEPOSIT_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Ghi chú (tuỳ chọn)</label>
                <input type="text" className={INP} value={loanForm.notes}
                  onChange={ev => setLoanForm(f => ({ ...f, notes: ev.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAddLoan(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Huỷ
              </button>
              <button
                onClick={handleAddLoan}
                disabled={saving || !loanForm.description || !loanForm.amount}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Ghi khoản mượn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Loan */}
      {editingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Sửa khoản mượn</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Ngày mượn</label>
                  <input type="date" className={INP} value={loanEditForm.date}
                    onChange={ev => setLoanEditForm(f => ({ ...f, date: ev.target.value }))} />
                </div>
                <div>
                  <label className={LBL}>Số tiền mượn (₫)</label>
                  <input type="number" min="0" className={INP} value={loanEditForm.amount}
                    onChange={ev => setLoanEditForm(f => ({ ...f, amount: ev.target.value }))} />
                </div>
              </div>
              <div>
                <label className={LBL}>Mục đích</label>
                <input type="text" className={INP} value={loanEditForm.description}
                  onChange={ev => setLoanEditForm(f => ({ ...f, description: ev.target.value }))} />
              </div>
              <div>
                <label className={LBL}>Mượn vào kênh</label>
                <select className={INP} value={loanEditForm.channel}
                  onChange={ev => setLoanEditForm(f => ({ ...f, channel: ev.target.value }))}>
                  {DEPOSIT_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Ghi chú (tuỳ chọn)</label>
                <input type="text" className={INP} value={loanEditForm.notes}
                  onChange={ev => setLoanEditForm(f => ({ ...f, notes: ev.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditingLoan(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Huỷ
              </button>
              <button onClick={handleUpdateLoan}
                disabled={saving || !loanEditForm.description || !loanEditForm.amount}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Repay */}
      {repayingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Ghi trả nợ</h2>
            <p className="text-xs text-gray-600 mb-3">{repayingLoan.description}</p>
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Đã trả:</span>
                <span className="font-medium">{formatVND(repayingLoan.repaid_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Còn nợ:</span>
                <span className="font-bold text-orange-600">{formatVND(repayingLoan.amount - repayingLoan.repaid_amount)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Số tiền trả lần này (₫)</label>
                <input
                  type="number" min="0" className={INP} placeholder="0"
                  value={repayAmount}
                  onChange={ev => setRepayAmount(ev.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className={LBL}>Ngày trả</label>
                <input type="date" className={INP} value={repayDate}
                  onChange={ev => setRepayDate(ev.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className={LBL}>Trả từ kênh</label>
              <select className={INP} value={repayChannel}
                onChange={ev => setRepayChannel(ev.target.value)}>
                {DEPOSIT_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setRepayingLoan(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Huỷ
              </button>
              <button
                onClick={handleRepay}
                disabled={saving || !repayAmount}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Xác nhận trả'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quản lý ngân hàng con (TK Cá nhân) */}
      {showManageBanks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Quản lý ngân hàng (TK Cá nhân)</h2>
              <button onClick={() => setShowManageBanks(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-2 mb-4">
              {bankChannels.length === 0 && (
                <p className="text-sm text-gray-400 italic text-center py-2">Chưa có ngân hàng nào.</p>
              )}
              {bankChannels.map((b, i) => {
                const c = BANK_COLOR_CYCLE[i % BANK_COLOR_CYCLE.length]
                return (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.badge}`}>{b.label}</span>
                    <button onClick={() => handleDeleteBankChannel(b.id, b.code)} className="p-1 text-gray-300 hover:text-red-500 rounded">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <input
                className={INP}
                placeholder="Tên ngân hàng mới, VD: Vietcombank"
                value={newBankLabel}
                onChange={ev => setNewBankLabel(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter') handleAddBankChannel() }}
              />
              <button
                onClick={handleAddBankChannel}
                disabled={saving || !newBankLabel.trim()}
                className="px-3 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
              >
                <Plus size={14} /> Thêm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
