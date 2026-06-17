'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { UserRole, Project, Contract, Category, Transaction, Revenue, AuditLog } from '@/lib/types'
import { formatVND, calcVAT, calcTNCN } from '@/lib/utils'
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Archive, AlertCircle,
  Clock, CheckCircle2, FileText, Wrench, Pencil, X, Upload, Download
} from 'lucide-react'
import AddTransactionModal from './AddTransactionModal'
import AddRevenueModal from './AddRevenueModal'
import AddCategoryModal from './AddCategoryModal'
import ImportModal from './ImportModal'
import { exportProjectToExcel } from '@/lib/excel'

const VAT_LABEL: Record<string, string> = {
  vat_10: 'VAT 10%',
  vat_8: 'VAT 8%',
  no_vat: 'Không VAT',
}

const PAYMENT_COLOR: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-orange-100 text-orange-700',
  partial: 'bg-yellow-100 text-yellow-700',
}
const PAYMENT_LABEL: Record<string, string> = {
  paid: 'Đã TT',
  pending: 'Chưa TT',
  partial: 'TT một phần',
}

interface Props {
  project: Project
  contracts: Contract[]
  categories: Category[]
  transactions: (Transaction & { profiles?: { full_name: string; role: UserRole } | null })[]
  revenue: Revenue[]
  auditLogs: AuditLog[]
  role: UserRole
  userId: string
  userName: string
}

type TabId = 'vat' | 'no_vat' | 'revenue' | 'audit'

export default function ProjectDetail({
  project, contracts, categories, transactions, revenue, auditLogs, role, userId, userName
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<TabId>('vat')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [showTxModal, setShowTxModal] = useState(false)
  const [showRevModal, setShowRevModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [txContractId, setTxContractId] = useState<string>('')
  const [archiving, setArchiving] = useState(false)
  const [editContract, setEditContract] = useState<Contract | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)

  const isCeo = role === 'ceo'
  const isKetoan = role === 'ketoan'
  const isThicong = role === 'thicong'
  const canEdit = isCeo || isKetoan || isThicong
  const canSeeProfit = isCeo || isKetoan || isThicong
  const canArchive = isCeo

  const vatContract = contracts.find(c => c.type === 'vat')
  const noVatContract = contracts.find(c => c.type === 'no_vat')

  function txByContract(contractId: string | undefined) {
    if (!contractId) return []
    return transactions.filter(t => t.contract_id === contractId)
  }

  function txByCategory(contractId: string | undefined, categoryId: string) {
    return txByContract(contractId).filter(t => t.category_id === categoryId)
  }

  function vatSummary(contractId: string | undefined) {
    const rows = txByContract(contractId)
    const totalAmount = rows.reduce((s, t) => s + t.amount, 0)
    const totalVAT = rows.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
    const totalTNCN = rows.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)
    const netAmount = totalAmount - totalVAT
    const totalVatRevenue = vatContract ? vatContract.value : 0
    const netRevenue = totalVatRevenue / 1.1
    const profit = netRevenue - netAmount
    const profitPct = netRevenue > 0 ? ((profit / netRevenue) * 100).toFixed(1) : '0'
    return { totalAmount, totalVAT, totalTNCN, netAmount, netRevenue, profit, profitPct }
  }

  const vatSumm = vatSummary(vatContract?.id)
  const noVatSumm = vatSummary(noVatContract?.id)
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0)
  const collectedRevenue = revenue.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)

  async function handleArchive() {
    if (!canArchive) return
    const confirmed = confirm('Đóng công trình này? Nó sẽ được chuyển vào lưu trữ và không hiển thị trên Dashboard.')
    if (!confirmed) return
    setArchiving(true)
    await supabase.from('projects').update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      archived_by: userId,
    }).eq('id', project.id)
    router.push('/projects')
    router.refresh()
  }

  function toggleCat(catId: string) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  const TABS: { id: TabId; label: string; show: boolean }[] = [
    { id: 'vat', label: `HĐ Xuất VAT${vatContract ? ` (${formatVND(vatContract.value)})` : ''}`, show: true },
    { id: 'no_vat', label: `HĐ Không HĐ${noVatContract ? ` (${formatVND(noVatContract.value)})` : ''}`, show: true },
    { id: 'revenue', label: 'Doanh thu', show: isCeo || isKetoan },
    { id: 'audit', label: 'Lịch sử chỉnh sửa', show: true },
  ]

  function openTxModal(contractId: string) {
    setTxContractId(contractId)
    setShowTxModal(true)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/projects" className="mt-1 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {project.status === 'active' ? 'Đang chạy' : project.status === 'archived' ? 'Lưu trữ' : 'Hoàn thành'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {project.customer_name}{project.address ? ` · ${project.address}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => exportProjectToExcel(project, contracts, categories, transactions, revenue)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download size={14} />
            Xuất Excel
          </button>
          {canEdit && project.status === 'active' && (
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Upload size={14} />
              Nhập Excel
            </button>
          )}
          {canArchive && project.status === 'active' && (
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Archive size={14} />
              Đóng & Lưu trữ
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {canSeeProfit && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Doanh thu HĐ VAT"
            value={formatVND(vatContract?.value ?? 0)}
            accent="blue"
            onEdit={canEdit && vatContract ? () => setEditContract(vatContract) : undefined}
          />
          <SummaryCard label="Chi phí HĐ VAT (sau VAT)" value={formatVND(vatSumm.netAmount)} accent="orange" />
          <SummaryCard
            label={`Lợi nhuận VAT (${vatSumm.profitPct}%)`}
            value={formatVND(vatSumm.profit)}
            accent={vatSumm.profit >= 0 ? 'green' : 'red'}
          />
          <SummaryCard
            label="Giá trị HĐ không HĐ"
            value={formatVND(noVatContract?.value ?? 0)}
            accent="gray"
            onEdit={canEdit && noVatContract ? () => setEditContract(noVatContract) : undefined}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.filter(t => t.show).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {(activeTab === 'vat' || activeTab === 'no_vat') && (
        <ContractTab
          contract={activeTab === 'vat' ? vatContract : noVatContract}
          categories={categories}
          txByCategory={(catId) => txByCategory(
            activeTab === 'vat' ? vatContract?.id : noVatContract?.id, catId
          )}
          txByContract={() => txByContract(activeTab === 'vat' ? vatContract?.id : noVatContract?.id)}
          isVat={activeTab === 'vat'}
          canEdit={canEdit && project.status === 'active'}
          expandedCats={expandedCats}
          toggleCat={toggleCat}
          onAddTx={() => openTxModal(activeTab === 'vat' ? vatContract?.id ?? '' : noVatContract?.id ?? '')}
          onAddCategory={() => setShowCatModal(true)}
          role={role}
        />
      )}

      {activeTab === 'revenue' && (isCeo || isKetoan) && (
        <RevenueTab
          revenue={revenue}
          totalRevenue={totalRevenue}
          collectedRevenue={collectedRevenue}
          canEdit={project.status === 'active'}
          onAdd={() => setShowRevModal(true)}
        />
      )}

      {activeTab === 'audit' && (
        <AuditTab logs={auditLogs} />
      )}

      {/* Modals */}
      {showTxModal && (
        <AddTransactionModal
          projectId={project.id}
          contractId={txContractId}
          categories={categories}
          userId={userId}
          userName={userName}
          role={role}
          onClose={() => { setShowTxModal(false); router.refresh() }}
        />
      )}

      {showRevModal && (
        <AddRevenueModal
          projectId={project.id}
          contracts={contracts}
          userId={userId}
          onClose={() => { setShowRevModal(false); router.refresh() }}
        />
      )}

      {showCatModal && (
        <AddCategoryModal
          projectId={project.id}
          onClose={() => { setShowCatModal(false); router.refresh() }}
        />
      )}

      {editContract && (
        <EditContractValueModal
          contract={editContract}
          onClose={() => { setEditContract(null); router.refresh() }}
        />
      )}

      {showImportModal && (
        <ImportModal
          projectId={project.id}
          contracts={contracts}
          categories={categories}
          userId={userId}
          projectName={project.name}
          onClose={() => { setShowImportModal(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent, onEdit }: { label: string; value: string; accent: string; onEdit?: () => void }) {
  const accentMap: Record<string, string> = {
    blue: 'text-blue-700',
    orange: 'text-orange-700',
    green: 'text-green-700',
    red: 'text-red-700',
    gray: 'text-gray-700',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">{label}</p>
        {onEdit && (
          <button onClick={onEdit} className="text-gray-300 hover:text-blue-500">
            <Pencil size={12} />
          </button>
        )}
      </div>
      <p className={`text-base font-semibold ${accentMap[accent] ?? 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function EditContractValueModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const supabase = createClient()
  const [value, setValue] = useState(String(contract.value))
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await supabase.from('contracts').update({ value: parseInt(value || '0', 10) }).eq('id', contract.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            Giá trị {contract.type === 'vat' ? 'HĐ Xuất VAT' : 'HĐ Không HĐ'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Giá trị hợp đồng (VND)</label>
            <input
              type="number" min="0" step="1" value={value} onChange={e => setValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ContractTab({
  contract, categories, txByCategory, txByContract, isVat, canEdit,
  expandedCats, toggleCat, onAddTx, onAddCategory, role
}: {
  contract?: Contract
  categories: Category[]
  txByCategory: (catId: string) => Transaction[]
  txByContract: () => Transaction[]
  isVat: boolean
  canEdit: boolean
  expandedCats: Set<string>
  toggleCat: (id: string) => void
  onAddTx: () => void
  onAddCategory: () => void
  role: UserRole
}) {
  const allTx = txByContract()
  const totalCost = allTx.reduce((s, t) => s + t.amount, 0)
  const totalVAT = allTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
  const totalTNCN = allTx.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)
  const unpaid = allTx.filter(t => t.payment_status === 'pending').reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-4">
      {/* Contract summary */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-500">Tổng chi phí</p>
          <p className="font-semibold text-gray-900 mt-0.5">{formatVND(totalCost)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Chưa thanh toán</p>
          <p className="font-semibold text-orange-600 mt-0.5">{formatVND(unpaid)}</p>
        </div>
        {isVat && (
          <>
            <div>
              <p className="text-xs text-gray-500">VAT phải nộp</p>
              <p className="font-semibold text-purple-600 mt-0.5">{formatVND(totalVAT)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">TNCN phải nộp</p>
              <p className="font-semibold text-pink-600 mt-0.5">{formatVND(totalTNCN)}</p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center gap-2">
          <button onClick={onAddCategory} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <Plus size={14} /> Thêm hạng mục
          </button>
          <button onClick={onAddTx} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            <Plus size={14} /> Thêm khoản chi
          </button>
        </div>
      )}

      {/* Categories accordion */}
      {categories.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-sm text-gray-400">
          Chưa có hạng mục. {canEdit ? 'Nhấn "+ Thêm hạng mục" để bắt đầu.' : ''}
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map(cat => {
            const catTx = txByCategory(cat.id)
            const vatTx = catTx.filter(t => !t.is_labor)
            const laborTx = catTx.filter(t => t.is_labor)
            const catTotal = catTx.reduce((s, t) => s + t.amount, 0)
            const catVAT = catTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
            const catTNCN = catTx.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)
            const isExpanded = expandedCats.has(cat.id)

            return (
              <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleCat(cat.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isExpanded ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900">{cat.name}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {catTx.length} khoản · {formatVND(catTotal)}
                        {isVat && catVAT > 0 && ` · VAT: ${formatVND(catVAT)}`}
                        {isVat && catTNCN > 0 && ` · TNCN: ${formatVND(catTNCN)}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm flex-shrink-0 ml-4">
                    <span className="hidden md:flex items-center gap-1 text-gray-500">
                      <Wrench size={12} /> Vật tư: <span className="font-medium text-gray-700">{formatVND(vatTx.reduce((s, t) => s + t.amount, 0))}</span>
                    </span>
                    <span className="hidden md:flex items-center gap-1 text-gray-500">
                      <FileText size={12} /> Nhân công: <span className="font-medium text-gray-700">{formatVND(laborTx.reduce((s, t) => s + t.amount, 0))}</span>
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {catTx.length === 0 ? (
                      <p className="text-sm text-gray-400 px-5 py-4">Chưa có khoản chi nào trong hạng mục này.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Ngày</th>
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Loại</th>
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Nội dung</th>
                              <th className="text-right px-5 py-2.5 font-medium text-gray-500">Số tiền</th>
                              {isVat && (
                                <>
                                  <th className="text-left px-5 py-2.5 font-medium text-gray-500">Thuế</th>
                                  <th className="text-right px-5 py-2.5 font-medium text-gray-500">VAT/TNCN</th>
                                  <th className="text-left px-5 py-2.5 font-medium text-gray-500">HĐ / HĐ nhân công</th>
                                </>
                              )}
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">TT</th>
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Đơn vị nhập</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {catTx.map(tx => (
                              <tr key={tx.id} className="hover:bg-blue-50/30">
                                <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                                  {new Date(tx.transaction_date).toLocaleDateString('vi-VN')}
                                </td>
                                <td className="px-5 py-2.5">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${tx.is_labor ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {tx.is_labor ? <><FileText size={10} /> NC</> : <><Wrench size={10} /> VT</>}
                                  </span>
                                </td>
                                <td className="px-5 py-2.5 text-gray-900 max-w-[200px] truncate">{tx.description}</td>
                                <td className="px-5 py-2.5 text-right font-medium text-gray-900 whitespace-nowrap">{formatVND(tx.amount)}</td>
                                {isVat && (
                                  <>
                                    <td className="px-5 py-2.5 text-gray-600">
                                      {tx.is_labor ? 'TNCN 10%' : VAT_LABEL[tx.vat_rate]}
                                    </td>
                                    <td className="px-5 py-2.5 text-right text-purple-600 whitespace-nowrap">
                                      {tx.is_labor
                                        ? formatVND(tx.tncn_amount ?? 0)
                                        : formatVND(tx.vat_amount ?? 0)
                                      }
                                    </td>
                                    <td className="px-5 py-2.5">
                                      {tx.is_labor ? (
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${tx.labor_contract_status === 'signed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                          {tx.labor_contract_status === 'signed' ? 'Có HĐ NC' : 'Chưa có HĐ'}
                                        </span>
                                      ) : (
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                                          tx.invoice_status === 'has_invoice' ? 'bg-green-100 text-green-700'
                                          : tx.invoice_status === 'waiting' ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-gray-100 text-gray-500'
                                        }`}>
                                          {tx.invoice_status === 'has_invoice' ? 'Đã có HĐ' : tx.invoice_status === 'waiting' ? 'Chờ HĐ' : 'Không HĐ'}
                                        </span>
                                      )}
                                    </td>
                                  </>
                                )}
                                <td className="px-5 py-2.5">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${PAYMENT_COLOR[tx.payment_status]}`}>
                                    {PAYMENT_LABEL[tx.payment_status]}
                                  </span>
                                </td>
                                <td className="px-5 py-2.5 text-gray-500">{tx.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RevenueTab({
  revenue, totalRevenue, collectedRevenue, canEdit, onAdd
}: {
  revenue: Revenue[]
  totalRevenue: number
  collectedRevenue: number
  canEdit: boolean
  onAdd: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-700">Tổng doanh thu HĐ</p>
          <p className="text-lg font-bold text-blue-800 mt-1">{formatVND(totalRevenue)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-green-700">Đã thu</p>
          <p className="text-lg font-bold text-green-800 mt-1">{formatVND(collectedRevenue)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
          <p className="text-xs text-orange-700">Còn lại</p>
          <p className="text-lg font-bold text-orange-800 mt-1">{formatVND(totalRevenue - collectedRevenue)}</p>
        </div>
      </div>

      {canEdit && (
        <div>
          <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            <Plus size={14} /> Thêm đợt thu
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {revenue.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">Chưa có đợt thu tiền nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Đợt</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500">Số tiền</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Ngày thu</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Trạng thái</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Hình thức</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {revenue.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{r.stage}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatVND(r.amount)}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {r.collected_date ? new Date(r.collected_date).toLocaleDateString('vi-VN') : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'collected' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {r.status === 'collected' ? <><CheckCircle2 size={11} /> Đã thu</> : <><Clock size={11} /> Chưa thu</>}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 hidden md:table-cell">{r.payment_method}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AuditTab({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-sm text-gray-400">
        Chưa có lịch sử chỉnh sửa.
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="divide-y divide-gray-100">
        {logs.map(log => (
          <div key={log.id} className="px-5 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="text-sm">
                <span className="font-medium text-gray-900">{log.profiles?.full_name ?? 'Người dùng'}</span>
                <span className="text-gray-500"> chỉnh sửa trường </span>
                <span className="font-medium text-gray-700">{log.field_name}</span>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {new Date(log.changed_at).toLocaleString('vi-VN')}
              </span>
            </div>
            {(log.old_value || log.new_value) && (
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                <span className="line-through text-red-500">{log.old_value ?? '(trống)'}</span>
                <span>→</span>
                <span className="text-green-600">{log.new_value ?? '(trống)'}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
