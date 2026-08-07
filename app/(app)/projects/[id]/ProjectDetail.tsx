'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { UserRole, Project, ProjectStatus, Contract, Category, Transaction, Revenue, AuditLog, VatRate, InvoiceStatus, ContractStatus, PaymentEntry } from '@/lib/types'
import { formatVND, calcVAT, calcTNCN } from '@/lib/utils'
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Archive, AlertCircle,
  Clock, CheckCircle2, FileText, Wrench, Pencil, X, Upload, Download, Filter, Trash2, History, ArrowLeftRight, Receipt
} from 'lucide-react'
import AddTransactionModal from './AddTransactionModal'
import AddRevenueModal from './AddRevenueModal'
import AddCategoryModal from './AddCategoryModal'
import ImportModal from './ImportModal'
import ProjectAdvanceSection, { ProjectAdvance, AdvanceSpentItem } from './ProjectAdvanceSection'
import EditVatAllocModal from './EditVatAllocModal'
import { exportProjectToExcel, exportTaxInvoiceReport } from '@/lib/excel'

const VAT_LABEL: Record<string, string> = {
  vat_10: 'VAT 10%',
  vat_8: 'VAT 8%',
  no_vat: 'Không VAT',
}

const NOTE_COLOR: Record<string, string> = {
  'TM': 'bg-green-100 text-green-700',
  'CK CTY': 'bg-blue-100 text-blue-700',
  'CK CN': 'bg-violet-100 text-violet-700',
  'Từ quỹ ứng': 'bg-amber-100 text-amber-700',
  // legacy
  'Tiền mặt': 'bg-green-100 text-green-700',
  'CK công ty': 'bg-blue-100 text-blue-700',
  'CK cá nhân': 'bg-violet-100 text-violet-700',
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
  siteAdvances: ProjectAdvance[]
  advanceSpent: number
  advanceSpentItems: AdvanceSpentItem[]
  projectNameMap: Record<string, string>
  categoryNameMap: Record<string, string>
  reverseAlloc: Record<string, { total: number; dests: { name: string; amount: number }[] }>
  incomingVatAlloc: { total: number; items: { id: string; amount: number; description: string; date: string; destCategoryId: string | null; sourceProjectName: string; sourceCategoryName: string }[] }
  role: UserRole
  userId: string
  userName: string
  editTxId?: string
}

type TabId = 'vat' | 'no_vat' | 'revenue' | 'audit'

export default function ProjectDetail({
  project, contracts, categories, transactions, revenue, auditLogs, siteAdvances, advanceSpent, advanceSpentItems,
  projectNameMap, categoryNameMap, reverseAlloc, incomingVatAlloc,
  role, userId, userName, editTxId
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<TabId>('vat')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [showTxModal, setShowTxModal] = useState(false)
  const [showRevModal, setShowRevModal] = useState(false)
  const [editRevenue, setEditRevenue] = useState<Revenue | null>(null)
  const [showCatModal, setShowCatModal] = useState(false)
  const [txContractId, setTxContractId] = useState<string>('')
  const [txDefaultCategoryId, setTxDefaultCategoryId] = useState<string | undefined>(undefined)
  const [archiving, setArchiving] = useState(false)
  const [projectStatus, setProjectStatus] = useState(project.status)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [editContract, setEditContract] = useState<Contract | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [globalEditTx, setGlobalEditTx] = useState<Transaction | null>(null)
  const [projectHs, setProjectHs] = useState({
    hs_khach: project.hs_khach ?? false,
    hs_ncc: project.hs_ncc ?? false,
    hs_nhan_cong: project.hs_nhan_cong ?? false,
  })
  const [projectComm, setProjectComm] = useState({
    commission_hieu: project.commission_hieu ?? false,
    commission_tan: project.commission_tan ?? false,
  })
  const [showEditProject, setShowEditProject] = useState(false)
  const [projectInfo, setProjectInfo] = useState({
    name: project.name,
    customer_name: project.customer_name,
    address: project.address ?? '',
    start_date: project.start_date ?? '',
    end_date: project.end_date ?? '',
    phase: project.phase ?? '',
    status: project.status,
    documents_folder_url: project.documents_folder_url ?? '',
  })
  const [txVerified, setTxVerified] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(transactions.map(t => [t.id, t.kt_verified ?? false]))
  )

  async function toggleProjectHs(field: 'hs_khach' | 'hs_ncc' | 'hs_nhan_cong') {
    const newVal = !projectHs[field]
    setProjectHs(prev => ({ ...prev, [field]: newVal }))
    const { error } = await supabase.from('projects').update({ [field]: newVal }).eq('id', project.id)
    if (error) setProjectHs(prev => ({ ...prev, [field]: !newVal }))
  }

  async function toggleProjectComm(field: 'commission_hieu' | 'commission_tan') {
    const newVal = !projectComm[field]
    setProjectComm(prev => ({ ...prev, [field]: newVal }))
    const { error } = await supabase.from('projects').update({ [field]: newVal }).eq('id', project.id)
    if (error) setProjectComm(prev => ({ ...prev, [field]: !newVal }))
  }

  async function toggleTxVerified(txId: string) {
    const newVal = !txVerified[txId]
    setTxVerified(prev => ({ ...prev, [txId]: newVal }))
    const res = await fetch(`/api/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kt_verified: newVal }),
    })
    if (!res.ok) setTxVerified(prev => ({ ...prev, [txId]: !newVal }))
  }

  useEffect(() => {
    if (editTxId) {
      const tx = transactions.find(t => t.id === editTxId)
      if (tx) setGlobalEditTx(tx)
    }
  }, [editTxId, transactions])

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

  function vatSummary(contractId: string | undefined, netRevenue: number, includeTNCN: boolean, incomingVat = 0) {
    const rows = txByContract(contractId)
    const regularRows = rows.filter(t => !t.is_vat_allocation)
    const allocRows = rows.filter(t => t.is_vat_allocation)
    const totalAmount = regularRows.reduce((s, t) => s + t.amount, 0)
    const regularVAT = regularRows.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
    const allocVAT = allocRows.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
    const totalVAT = regularVAT + allocVAT + incomingVat
    const totalTNCN = regularRows.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)
    const netAmount = totalAmount - regularVAT + (includeTNCN ? totalTNCN : 0)
    const profit = netRevenue - netAmount
    const profitPct = netRevenue > 0 ? ((profit / netRevenue) * 100).toFixed(1) : '0'
    return { totalAmount, totalVAT, totalTNCN, netAmount, netRevenue, profit, profitPct }
  }

  const vatNetRevenue = Math.round((vatContract?.value ?? 0) / 1.08)
  const noVatNetRevenue = noVatContract?.value ?? 0
  const vatSumm = vatSummary(vatContract?.id, vatNetRevenue, true, incomingVatAlloc.total)
  const noVatSumm = vatSummary(noVatContract?.id, noVatNetRevenue, false)
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0)
  const collectedRevenue = revenue.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)

  // Chi phí hợp lệ về thuế TNDN 17% (chỉ tính trong HĐ Xuất VAT):
  //   VT: amount - vat_amount (VAT đầu vào được khấu trừ nên chỉ tính giá chưa VAT)
  //   NC: amount có đóng TNCN (không có VAT)
  const vatTxForTNDN = transactions.filter(t => t.contract_id === vatContract?.id && !t.is_vat_allocation)
  const cpHopLeVT  = vatTxForTNDN.filter(t => !t.is_labor && (t.vat_amount ?? 0) > 0)
    .reduce((s, t) => s + t.amount - (t.vat_amount ?? 0), 0)
  const cpHopLeNC  = vatTxForTNDN.filter(t =>  t.is_labor && (t.tncn_amount ?? 0) > 0).reduce((s, t) => s + t.amount, 0)
  const cpHopLe    = cpHopLeVT + cpHopLeNC
  const cpKhongHopLe = vatSumm.totalAmount - vatSumm.totalVAT - cpHopLe

  async function deleteRevenue(id: string, stage: string) {
    if (!confirm(`Xóa đợt thu "${stage}"?`)) return
    await supabase.from('revenue').delete().eq('id', id)
    router.refresh()
  }

  async function handleToggleStatus() {
    if (!canArchive) return
    const next = projectStatus === 'active' ? 'completed' : 'active'
    setTogglingStatus(true)
    const { error } = await supabase.from('projects').update({ status: next }).eq('id', project.id)
    if (!error) setProjectStatus(next)
    setTogglingStatus(false)
  }

  async function handleArchive() {
    if (!canArchive) return
    const confirmed = confirm('Lưu trữ công trình này? Nó sẽ không hiển thị trên Dashboard nữa.')
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
    { id: 'no_vat', label: `HĐ Không VAT${noVatContract ? ` (${formatVND(noVatContract.value)})` : ''}`, show: true },
    { id: 'revenue', label: 'Doanh thu', show: isCeo || isKetoan || isThicong },
    { id: 'audit', label: 'Lịch sử chỉnh sửa', show: true },
  ]

  function openTxModal(contractId: string, categoryId?: string) {
    setTxContractId(contractId)
    setTxDefaultCategoryId(categoryId)
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
              <h1 className="text-xl font-semibold text-gray-900">{projectInfo.name}</h1>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                projectStatus === 'active' ? 'bg-green-100 text-green-700'
                : projectStatus === 'completed' ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500'
              }`}>
                {projectStatus === 'active' ? 'Đang chạy' : projectStatus === 'archived' ? 'Lưu trữ' : 'Đã hoàn thành'}
              </span>
              {canEdit && (
                <button
                  onClick={() => setShowEditProject(true)}
                  className="p-1 text-gray-400 hover:text-blue-600 rounded-md transition-colors"
                  title="Chỉnh sửa thông tin dự án"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {projectInfo.customer_name}{projectInfo.address ? ` · ${projectInfo.address}` : ''}
              {(projectInfo.start_date || projectInfo.end_date) && (
                <span className="ml-1">
                  · {projectInfo.start_date ? new Date(projectInfo.start_date).toLocaleDateString('vi-VN') : '?'}
                  {projectInfo.end_date ? ` – ${new Date(projectInfo.end_date).toLocaleDateString('vi-VN')}` : ''}
                </span>
              )}
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
          <button
            onClick={() => exportTaxInvoiceReport(project, transactions, categories)}
            title="Danh sách hóa đơn vật tư + nhân công hợp lệ, để đối chiếu tờ khai thuế"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Receipt size={14} />
            Xuất hóa đơn hợp lệ (thuế)
          </button>
          {canEdit && projectStatus === 'active' && (
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Upload size={14} />
              Nhập Excel
            </button>
          )}
          {canArchive && projectStatus !== 'archived' && (
            <button
              onClick={handleToggleStatus}
              disabled={togglingStatus}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors disabled:opacity-50 ${
                projectStatus === 'active'
                  ? 'text-blue-600 border-blue-200 hover:bg-blue-50'
                  : 'text-green-600 border-green-200 hover:bg-green-50'
              }`}
            >
              <CheckCircle2 size={14} />
              {togglingStatus ? '...' : projectStatus === 'active' ? 'Đánh dấu hoàn thành' : 'Đang chạy lại'}
            </button>
          )}
          {canArchive && projectStatus !== 'archived' && (
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Archive size={14} />
              Lưu trữ
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {canSeeProfit && (
        <div className="space-y-2">
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1.5 px-0.5">HĐ Xuất VAT</p>
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard
                label="Doanh thu"
                value={formatVND(vatContract?.value ?? 0)}
                accent="blue"
                onEdit={canEdit && vatContract ? () => setEditContract(vatContract) : undefined}
                subLabel="Chưa VAT"
                subValue={formatVND(vatNetRevenue)}
                note={vatContract && (vatContract.value > 0) ? (
                  vatContract.invoice_issue_date ? (
                    <p className="text-xs text-gray-400 mt-1">
                      Ngày xuất HĐ: <span className="text-gray-500 font-medium">{new Date(vatContract.invoice_issue_date).toLocaleDateString('vi-VN')}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-orange-600 mt-1 font-medium">⚠ Chưa ghi ngày xuất HĐ</p>
                  )
                ) : undefined}
              />
              <SummaryCard label="Chi phí (không VAT)" value={formatVND(vatSumm.netAmount)} accent="orange" />
              <SummaryCard
                label={`Lợi nhuận (${vatSumm.profitPct}%)`}
                value={formatVND(vatSumm.profit)}
                accent={vatSumm.profit >= 0 ? 'green' : 'red'}
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1.5 px-0.5">HĐ Không VAT</p>
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard
                label="Doanh thu"
                value={formatVND(noVatContract?.value ?? 0)}
                accent="blue"
                onEdit={canEdit && noVatContract ? () => setEditContract(noVatContract) : undefined}
              />
              <SummaryCard label="Chi phí" value={formatVND(noVatSumm.netAmount)} accent="orange" />
              <SummaryCard
                label={`Lợi nhuận (${noVatSumm.profitPct}%)`}
                value={formatVND(noVatSumm.profit)}
                accent={noVatSumm.profit >= 0 ? 'green' : 'red'}
              />
            </div>
          </div>

          {/* Bảng tổng hợp */}
          {(() => {
            const totalRevenue = vatNetRevenue + noVatNetRevenue
            const totalProfit = vatSumm.profit + noVatSumm.profit
            const totalProfitPct = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0'
            return (
              <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-violet-600 mb-3 uppercase tracking-wide">Tổng hợp công trình</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Tên công trình</p>
                    <p className="font-semibold text-gray-900 text-sm leading-tight">{projectInfo.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Tổng DT trước VAT</p>
                    <p className="font-semibold text-indigo-700">{formatVND(totalRevenue)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">HĐ VAT {formatVND(vatNetRevenue)} + KhVAT {formatVND(noVatNetRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Lợi nhuận thực</p>
                    <p className={`font-semibold ${totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatVND(totalProfit)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">VAT {formatVND(vatSumm.profit)} + KhVAT {formatVND(noVatSumm.profit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">% Lợi nhuận (sau trừ VAT)</p>
                    <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{totalProfitPct}%</p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* TNDN — chỉ CEO */}
          {vatContract && isCeo && (() => {
            const lnHopLe = vatNetRevenue - cpHopLe
            const lnHopLePct = vatNetRevenue > 0
              ? (((vatNetRevenue - cpHopLe) / vatNetRevenue) * 100).toFixed(1)
              : '0'
            return (
              <div className="bg-gradient-to-r from-amber-950 to-orange-900 rounded-xl p-4">
                <p className="text-xs font-bold text-amber-300 mb-3 uppercase tracking-wider">
                  🔒 Chi phí hợp lệ tính thuế TNDN 17% (HĐ Xuất VAT)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="bg-white/10 border border-amber-700/60 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-amber-300 mb-1">VT có HĐ VAT (sau trừ VAT vào)</p>
                    <p className="font-bold text-white text-sm">{formatVND(cpHopLeVT)}</p>
                  </div>
                  <div className="bg-white/10 border border-amber-700/60 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-amber-300 mb-1">Nhân công có HĐ + đóng TNCN</p>
                    <p className="font-bold text-white text-sm">{formatVND(cpHopLeNC)}</p>
                  </div>
                  <div className="bg-amber-600/40 border border-amber-500 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-amber-200 mb-1 font-semibold">Tổng CP hợp lệ</p>
                    <p className="font-black text-amber-100 text-base">{formatVND(cpHopLe)}</p>
                  </div>
                  <div className="bg-white/10 border border-amber-700/60 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-amber-300 mb-1">CP không hợp lệ (không có HĐ/TNCN)</p>
                    <p className="font-bold text-orange-200 text-sm">{formatVND(cpKhongHopLe)}</p>
                  </div>
                  <div className="bg-blue-950/60 border border-blue-500 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-blue-300 mb-1 font-semibold">% LN hợp lệ tính thuế</p>
                    <p className={`text-2xl font-black ${lnHopLe >= 0 ? 'text-blue-200' : 'text-red-300'}`}>
                      {lnHopLePct}%
                    </p>
                    <p className="text-[10px] text-amber-400 mt-1 leading-relaxed">
                      ({formatVND(vatNetRevenue)} − {formatVND(cpHopLe)}) / {formatVND(vatNetRevenue)}
                    </p>
                    <p className="text-[10px] text-blue-400 mt-0.5">Mẫu số: DT trước VAT (≠ giá HĐ)</p>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Hồ sơ công trình */}
      {(isCeo || isKetoan) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Hồ sơ công trình:</span>

          {/* HĐ khách hàng — manual toggle */}
          {(() => {
            const done = projectHs.hs_khach
            return (
              <button
                onClick={() => toggleProjectHs('hs_khach')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  done ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-gray-50 text-gray-500 border-gray-300 hover:bg-gray-100'
                }`}
              >
                <span>{done ? '✓' : '○'}</span>
                <span>HĐ khách hàng</span>
                <span className="font-normal">{done ? '· Đã xong HS' : '· Chưa xong HS'}</span>
              </button>
            )
          })()}

          {/* HĐ NCC vật tư — tự động từ kt_verified */}
          {(() => {
            const txList = transactions.filter(t => !t.is_labor && !t.is_vat_allocation)
            const total = txList.length
            const done = txList.filter(t => txVerified[t.id]).length
            const allDone = total > 0 && done === total
            return (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                allDone ? 'bg-green-50 text-green-700 border-green-300' : 'bg-gray-50 text-gray-500 border-gray-300'
              }`}>
                <span>{allDone ? '✓' : '○'}</span>
                <span>HĐ NCC vật tư</span>
                <span className="font-normal">· {allDone ? 'Đã xong HS' : `${done}/${total} đã xong`}</span>
              </span>
            )
          })()}

          {/* HĐ nhân công — tự động từ kt_verified */}
          {(() => {
            const txList = transactions.filter(t => t.is_labor)
            const total = txList.length
            const done = txList.filter(t => txVerified[t.id]).length
            const allDone = total > 0 && done === total
            return (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                allDone ? 'bg-green-50 text-green-700 border-green-300' : 'bg-gray-50 text-gray-500 border-gray-300'
              }`}>
                <span>{allDone ? '✓' : '○'}</span>
                <span>HĐ nhân công</span>
                <span className="font-normal">· {allDone ? 'Đã xong HS' : `${done}/${total} đã xong`}</span>
              </span>
            )
          })()}
        </div>
      )}

      {/* Hoa hồng công trình — tick công trình nào tính hoa hồng quyết toán cho Hiếu/Tấn — CHỈ CEO thấy */}
      {isCeo && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Hoa hồng công trình:</span>
          <button
            onClick={() => toggleProjectComm('commission_hieu')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              projectComm.commission_hieu ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' : 'bg-gray-50 text-gray-500 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <span>{projectComm.commission_hieu ? '✓' : '○'}</span>
            <span>Hiếu (1% quyết toán)</span>
          </button>
          <button
            onClick={() => toggleProjectComm('commission_tan')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              projectComm.commission_tan ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' : 'bg-gray-50 text-gray-500 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <span>{projectComm.commission_tan ? '✓' : '○'}</span>
            <span>Tấn (0.5% quyết toán)</span>
          </button>
        </div>
      )}

      {/* Tạm ứng CP giám sát công trình */}
      <ProjectAdvanceSection projectId={project.id} projectName={project.name} advances={siteAdvances} spent={advanceSpent} spentItems={advanceSpentItems} />

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
          canEdit={canEdit && project.status !== 'archived'}
          expandedCats={expandedCats}
          toggleCat={toggleCat}
          onAddTx={(categoryId) => openTxModal(activeTab === 'vat' ? vatContract?.id ?? '' : noVatContract?.id ?? '', categoryId)}
          onAddCategory={() => setShowCatModal(true)}
          role={role}
          userId={userId}
          canSeeHs={isCeo || isKetoan}
          txVerified={txVerified}
          toggleTxVerified={toggleTxVerified}
          otherContractId={activeTab === 'vat' ? noVatContract?.id : vatContract?.id}
          projectNameMap={projectNameMap}
          categoryNameMap={categoryNameMap}
          reverseAlloc={reverseAlloc}
          incomingVatAlloc={incomingVatAlloc}
          projectId={project.id}
        />
      )}

      {activeTab === 'revenue' && (isCeo || isKetoan || isThicong) && (
        <RevenueTab
          revenue={revenue}
          totalRevenue={totalRevenue}
          collectedRevenue={collectedRevenue}
          canEdit={(isCeo || isKetoan) && project.status !== 'archived'}
          canSeeStages={isCeo || isKetoan}
          onAdd={() => setShowRevModal(true)}
          onEdit={setEditRevenue}
          onDelete={deleteRevenue}
        />
      )}

      {activeTab === 'audit' && (
        <AuditTab logs={auditLogs} transactions={transactions} categories={categories} onOpenTx={setGlobalEditTx} />
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
          defaultCategoryId={txDefaultCategoryId}
          onClose={() => { setShowTxModal(false); router.refresh() }}
        />
      )}

      {(showRevModal || editRevenue) && (
        <AddRevenueModal
          projectId={project.id}
          contracts={contracts}
          userId={userId}
          revenue={editRevenue}
          onClose={() => { setShowRevModal(false); setEditRevenue(null); router.refresh() }}
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

      {globalEditTx && (
        <EditTransactionModal
          tx={globalEditTx}
          categories={categories}
          isVat={globalEditTx.contract_id === vatContract?.id}
          userId={userId}
          role={role}
          projectId={project.id}
          onClose={() => {
            setGlobalEditTx(null)
            router.replace(`/projects/${project.id}`)
            router.refresh()
          }}
        />
      )}

      {showEditProject && (
        <EditProjectModal
          projectId={project.id}
          initial={projectInfo}
          onClose={() => setShowEditProject(false)}
          onSave={(info) => {
            setProjectInfo(info)
            setProjectStatus(info.status)
            setShowEditProject(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent, onEdit, subLabel, subValue, note }: { label: string; value: string; accent: string; onEdit?: () => void; subLabel?: string; subValue?: string; note?: React.ReactNode }) {
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
      {subLabel && subValue && (
        <p className="text-xs text-gray-400 mt-1">{subLabel}: <span className="text-gray-500 font-medium">{subValue}</span></p>
      )}
      {note}
    </div>
  )
}

function EditContractValueModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const supabase = createClient()
  const [value, setValue] = useState(String(contract.value))
  const [invoiceDate, setInvoiceDate] = useState(contract.invoice_issue_date ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload: { value: number; invoice_issue_date?: string | null } = { value: parseInt(value || '0', 10) }
    if (contract.type === 'vat') payload.invoice_issue_date = invoiceDate || null
    await supabase.from('contracts').update(payload).eq('id', contract.id)
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
          {contract.type === 'vat' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày xuất hóa đơn đầu ra</label>
              <input
                type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {invoiceDate && (
                <p className="text-xs text-blue-600 mt-1 font-medium">
                  → {new Date(invoiceDate + 'T00:00:00').toLocaleDateString('vi-VN')}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Ô lịch của trình duyệt có thể hiện mm/dd/yyyy (theo cài đặt máy) — dòng trên luôn hiện đúng dd/mm/yyyy. Dùng để đối chiếu với tờ khai thuế GTGT ở trang Kiểm Soát Hóa Đơn.
              </p>
            </div>
          )}
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

function EditProjectModal({
  projectId, initial, onClose, onSave,
}: {
  projectId: string
  initial: { name: string; customer_name: string; address: string; start_date: string; end_date: string; phase: string; status: ProjectStatus; documents_folder_url: string }
  onClose: () => void
  onSave: (info: typeof initial) => void
}) {
  const supabase = createClient()
  const [name, setName] = useState(initial.name)
  const [customerName, setCustomerName] = useState(initial.customer_name)
  const [address, setAddress] = useState(initial.address)
  const [startDate, setStartDate] = useState(initial.start_date)
  const [endDate, setEndDate] = useState(initial.end_date)
  const [phase, setPhase] = useState(initial.phase)
  const [status, setStatus] = useState(initial.status)
  const [documentsFolderUrl, setDocumentsFolderUrl] = useState(initial.documents_folder_url)
  const [loading, setLoading] = useState(false)

  // Chọn Hoàn thành mà chưa có ngày kết thúc → doanh thu sẽ không được ghi nhận kỳ nào
  const needEndDate = status === 'completed' && !endDate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    const { error } = await supabase.from('projects').update({
      name: name.trim(),
      customer_name: customerName.trim(),
      address: address.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      phase: phase || null,
      status,
      documents_folder_url: documentsFolderUrl.trim() || null,
    }).eq('id', projectId)
    setLoading(false)
    if (!error) {
      onSave({
        name: name.trim(), customer_name: customerName.trim(), address: address.trim(),
        start_date: startDate, end_date: endDate, phase, status,
        documents_folder_url: documentsFolderUrl.trim(),
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Chỉnh sửa thông tin dự án</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tên dự án <span className="text-red-500">*</span></label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Chủ đầu tư / Khách hàng</label>
            <input
              type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Địa chỉ</label>
            <input
              type="text" value={address} onChange={e => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Giai đoạn</label>
              <select
                value={phase} onChange={e => setPhase(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Chưa chọn —</option>
                <option value="Thiết Kế">Thiết Kế</option>
                <option value="Thi Công">Thi Công</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái</label>
              <select
                value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Đang chạy</option>
                <option value="completed">Đã hoàn thành</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Ngày kết thúc {status === 'completed' && <span className="text-red-500">*</span>}
              </label>
              <input
                type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  needEndDate ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
            </div>
          </div>
          {status === 'completed' && (
            <div className={`rounded-lg px-3 py-2 text-xs ${needEndDate ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
              {needEndDate
                ? 'Cần điền Ngày kết thúc — đây là ngày ghi nhận doanh thu. Thiếu ngày thì công trình không vào bảng lợi nhuận kỳ nào.'
                : `Doanh thu + giá vốn của công trình sẽ ghi nhận vào ${new Date(endDate + 'T00:00:00').toLocaleDateString('vi-VN')} (trang Vận hành).`}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Link thư mục tài liệu (Google Drive)</label>
            <input
              type="url" value={documentsFolderUrl} onChange={e => setDocumentsFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Hiện ở trang Hợp đồng thầu phụ để lưu file .docx đúng chỗ.</p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={loading || !name.trim() || needEndDate} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ContractTab({
  contract, categories, txByCategory, txByContract, isVat, canEdit,
  expandedCats, toggleCat, onAddTx, onAddCategory, role, userId,
  canSeeHs, txVerified, toggleTxVerified, otherContractId,
  projectNameMap, categoryNameMap, reverseAlloc, incomingVatAlloc, projectId,
}: {
  contract?: Contract
  categories: Category[]
  txByCategory: (catId: string) => Transaction[]
  txByContract: () => Transaction[]
  isVat: boolean
  canEdit: boolean
  expandedCats: Set<string>
  toggleCat: (id: string) => void
  onAddTx: (categoryId?: string) => void
  onAddCategory: () => void
  role: UserRole
  userId: string
  canSeeHs: boolean
  txVerified: Record<string, boolean>
  toggleTxVerified: (id: string) => void
  otherContractId?: string
  projectNameMap: Record<string, string>
  categoryNameMap: Record<string, string>
  reverseAlloc: Record<string, { total: number; dests: { name: string; amount: number }[] }>
  incomingVatAlloc: { total: number; items: { id: string; amount: number; description: string; date: string; destCategoryId: string | null; sourceProjectName: string; sourceCategoryName: string }[] }
  projectId: string
}) {
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(() => new Set(categories.map(c => c.id)))
  const [showFilter, setShowFilter] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [viewMode, setViewMode] = useState<'category' | 'date'>('category')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week'>('all')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [supplierFilter, setSupplierFilter] = useState('')
  const [showSupplierDrop, setShowSupplierDrop] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'vt' | 'nc'>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showUnpaidDetail, setShowUnpaidDetail] = useState(false)
  const [showInvalidVatDetail, setShowInvalidVatDetail] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function saveCatName(catId: string) {
    if (!editingCatName.trim()) return
    setSavingCat(true)
    await supabase.from('categories').update({ name: editingCatName.trim() }).eq('id', catId)
    setSavingCat(false)
    setEditingCatId(null)
    router.refresh()
  }

  async function deleteCat(catId: string, catName: string, txCount: number) {
    if (txCount > 0) {
      alert(`Hạng mục "${catName}" còn ${txCount} khoản chi. Xóa hết khoản chi trước rồi mới xóa hạng mục.`)
      return
    }
    if (!confirm(`Xóa hạng mục "${catName}"?`)) return
    await supabase.from('categories').delete().eq('id', catId)
    router.refresh()
  }

  async function deleteTx(txId: string) {
    if (!confirm('Xóa khoản chi này?')) return
    setDeletingId(txId)
    try {
      const res = await fetch(`/api/transactions/${txId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert('Lỗi khi xóa: ' + (body.error ?? res.statusText))
        setDeletingId(null)
        return
      }
      window.location.reload()
    } catch {
      alert('Lỗi kết nối. Thử lại sau.')
      setDeletingId(null)
    }
  }

  async function moveTx(txId: string) {
    if (!otherContractId) return
    const label = isVat ? 'HĐ Không VAT' : 'HĐ Xuất VAT'
    if (!confirm(`Chuyển khoản chi này sang ${label}?`)) return
    await supabase.from('transactions').update({ contract_id: otherContractId }).eq('id', txId)
    router.refresh()
  }

  async function moveCategoryTx(catId: string, catName: string, txCount: number) {
    if (!otherContractId || !contract?.id) return
    const label = isVat ? 'HĐ Không VAT' : 'HĐ Xuất VAT'
    if (!confirm(`Chuyển toàn bộ hạng mục "${catName}" (${txCount} khoản chi) sang ${label}?`)) return
    await supabase.from('transactions')
      .update({ contract_id: otherContractId })
      .eq('category_id', catId)
      .eq('contract_id', contract.id)
    router.refresh()
  }

  const allTxRaw = txByContract()
  // Chỉ hiện hạng mục có ít nhất 1 khoản chi trong hợp đồng này
  const catsWithTx = new Set(allTxRaw.map(t => t.category_id).filter(Boolean))
  // Khoản Phân bổ nhận từ công trình khác — gom theo hạng mục nhận, chỉ hiện ở HĐ Xuất VAT
  const incomingByCategory: Record<string, typeof incomingVatAlloc.items> = {}
  if (isVat) {
    for (const item of incomingVatAlloc.items) {
      if (!item.destCategoryId) continue
      ;(incomingByCategory[item.destCategoryId] ??= []).push(item)
      catsWithTx.add(item.destCategoryId)
    }
  }
  const isFiltered = selectedCatIds.size < categories.length
  const visibleCategories = categories.filter(c => selectedCatIds.has(c.id) && catsWithTx.has(c.id))
  const allTx = allTxRaw.filter(t => !t.category_id || selectedCatIds.has(t.category_id))

  const allSuppliers = Array.from(new Set(allTx.map(t => t.supplier).filter(Boolean))) as string[]
  function withFilters(tx: Transaction[]) {
    let result = tx
    if (supplierFilter) result = result.filter(t => t.supplier === supplierFilter)
    if (typeFilter === 'vt') result = result.filter(t => !t.is_labor && !t.is_vat_allocation)
    if (typeFilter === 'nc') result = result.filter(t => t.is_labor)
    return result
  }
  const supplierTxList = withFilters(allTx)
  const supplierTotal = supplierTxList.reduce((s, t) => s + t.amount, 0)
  const supplierPaid = supplierTxList.reduce((s, t) => {
    if (t.payment_status === 'paid') return s + t.amount
    if (t.payment_status === 'partial') return s + (t.actual_paid ?? 0)
    return s
  }, 0)
  const supplierOwed = supplierTotal - supplierPaid

  const regularTx = allTx.filter(t => !t.is_vat_allocation)
  const totalCost = regularTx.reduce((s, t) => s + t.amount + (isVat ? (t.tncn_amount ?? 0) : 0), 0)
  // VAT đầu vào = VAT của khoản chi trong hợp đồng này + VAT nhận khấu trừ hộ từ công trình khác (chỉ HĐ Xuất VAT)
  const totalVATInput = allTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0) + (isVat ? incomingVatAlloc.total : 0)
  const totalVAT = totalVATInput
  const vatOutputRevenue = isVat && contract ? contract.value - Math.round(contract.value / 1.08) : 0
  const netVATPayable = vatOutputRevenue - totalVATInput
  const totalTNCN = regularTx.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)
  const unpaidItems = regularTx.filter(t => t.payment_status === 'pending')
  const unpaid = unpaidItems.reduce((s, t) => s + t.amount, 0)
  const totalMaterial = regularTx.filter(t => !t.is_labor).reduce((s, t) => s + t.amount, 0)
  const totalLabor = regularTx.filter(t => t.is_labor).reduce((s, t) => s + t.amount, 0)
  // Chi phí hợp lệ về thuế trong tab này (VT: sau trừ VAT vào; NC: giữ nguyên)
  const tabCpHopLeVT = regularTx.filter(t => !t.is_labor && (t.vat_amount ?? 0) > 0)
    .reduce((s, t) => s + t.amount - (t.vat_amount ?? 0), 0)
  const tabCpHopLeNC = regularTx.filter(t =>  t.is_labor && (t.tncn_amount ?? 0) > 0).reduce((s, t) => s + t.amount, 0)
  const tabCpHopLe   = tabCpHopLeVT + tabCpHopLeNC
  // Chi phí vật tư trong HĐ VAT nhưng KHÔNG có hóa đơn VAT (mua ngoài không hóa đơn) — rủi ro thuế
  const invalidVatItems = regularTx.filter(t => !t.is_labor && (t.vat_amount ?? 0) === 0)
  const khongHopLeVT = invalidVatItems.reduce((s, t) => s + t.amount, 0)
  const categoryMap = new Map(categories.map(c => [c.id, c.name]))
  const todayStr = new Date().toISOString().slice(0, 10)
  const weekAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const sortedDateTx = withFilters(allTx)
    .filter(t => {
      const d = t.transaction_date.slice(0, 10)
      if (dateFilter === 'today') return d === todayStr
      if (dateFilter === 'week') return d >= weekAgoStr
      return true
    })
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
  const dateGroups = sortedDateTx.reduce((acc, tx) => {
    const d = tx.transaction_date.slice(0, 10)
    if (!acc[d]) acc[d] = []
    acc[d].push(tx)
    return acc
  }, {} as Record<string, Transaction[]>)

  return (
    <div className="space-y-4">
      {/* Contract summary */}
      <div className={`bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-3 ${isVat ? (role === 'ceo' ? 'lg:grid-cols-8' : 'lg:grid-cols-6') : 'lg:grid-cols-4'} gap-4 text-sm`}>
        <div className="pl-1 border-l-2 border-gray-300">
          <p className="text-xs text-gray-500">Tổng chi phí</p>
          <p className="font-semibold text-gray-900 mt-0.5">{formatVND(totalCost)}</p>
        </div>
        <div className="pl-1 border-l-2 border-orange-300">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs text-gray-500">Chưa thanh toán</p>
            {unpaidItems.length > 0 && (
              <button
                onClick={() => setShowUnpaidDetail(true)}
                title="Xem chi tiết các khoản chưa thanh toán"
                className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
              >
                <FileText size={10} /> Trích xuất
              </button>
            )}
          </div>
          <p className="font-semibold text-orange-600 mt-0.5">{formatVND(unpaid)}</p>
        </div>
        <div className="pl-1 border-l-2 border-blue-300">
          <p className="text-xs text-gray-500">Tổng vật tư</p>
          <p className="font-semibold text-blue-700 mt-0.5">{formatVND(totalMaterial)}</p>
        </div>
        <div className="pl-1 border-l-2 border-pink-300">
          <p className="text-xs text-gray-500">Tổng nhân công</p>
          <p className="font-semibold text-pink-700 mt-0.5">{formatVND(totalLabor)}</p>
        </div>
        {isVat && (
          <>
            <div className="pl-1 border-l-2 border-purple-300">
              <p className="text-xs text-gray-500">VAT nộp nhà nước</p>
              <p className={`font-semibold mt-0.5 ${netVATPayable >= 0 ? 'text-purple-600' : 'text-green-600'}`}>
                {formatVND(netVATPayable)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Ra {formatVND(vatOutputRevenue)} · Vào {formatVND(totalVATInput)}
              </p>
              {incomingVatAlloc.total > 0 && (
                <p
                  className="text-xs text-purple-500 mt-0.5"
                  title={incomingVatAlloc.items.map(i => `${i.sourceProjectName} · ${i.sourceCategoryName} (${i.description}): ${formatVND(i.amount)}`).join('\n')}
                >
                  trong đó {formatVND(incomingVatAlloc.total)} nhận từ công trình khác
                </p>
              )}
            </div>
            <div className="pl-1 border-l-2 border-rose-300">
              <p className="text-xs text-gray-500">TNCN phải nộp</p>
              <p className="font-semibold text-rose-600 mt-0.5">{formatVND(totalTNCN)}</p>
            </div>
            {role === 'ceo' && (
              <div className="pl-1 border-l-2 border-amber-400">
                <p className="text-xs text-amber-700 font-medium">CP hợp lệ (TNDN)</p>
                <p className="font-semibold text-amber-700 mt-0.5">{formatVND(tabCpHopLe)}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  VT {formatVND(tabCpHopLeVT)} · NC {formatVND(tabCpHopLeNC)}
                </p>
              </div>
            )}
            {role === 'ceo' && (
              <div className="pl-1 border-l-2 border-red-400">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs text-red-700 font-medium">CP không hợp lệ VAT</p>
                  {invalidVatItems.length > 0 && (
                    <button
                      onClick={() => setShowInvalidVatDetail(true)}
                      title="Xem chi tiết các khoản vật tư không có hóa đơn VAT"
                      className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      <FileText size={10} /> Trích xuất
                    </button>
                  )}
                </div>
                <p className="font-semibold text-red-700 mt-0.5">{formatVND(khongHopLeVT)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Vật tư không có hóa đơn VAT</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions + Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {canEdit && (
          <>
            <button onClick={onAddCategory} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Plus size={14} /> Thêm hạng mục
            </button>
            <button onClick={() => onAddTx()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              <Plus size={14} /> Thêm khoản chi
            </button>
          </>
        )}
        {viewMode === 'date' && (
          <div className="flex items-center gap-1">
            {(['all', 'today', 'week'] as const).map(f => (
              <button key={f} onClick={() => setDateFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${dateFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                {f === 'all' ? 'Tất cả' : f === 'today' ? 'Hôm nay' : 'Tuần này'}
              </button>
            ))}
          </div>
        )}
        {/* Type filter — luôn hiển thị */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {([
            { value: 'all', label: 'Tất cả' },
            { value: 'vt',  label: 'VT' },
            { value: 'nc',  label: 'NC' },
          ] as const).map(opt => (
            <button key={opt.value} onClick={() => setTypeFilter(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${typeFilter === opt.value ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('category')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${viewMode === 'category' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              Hạng mục
            </button>
            <button onClick={() => setViewMode('date')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${viewMode === 'date' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              Theo ngày
            </button>
          </div>
          {categories.length > 1 && viewMode === 'category' && (
            <div className="relative">
              <button
                onClick={() => setShowFilter(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                  isFiltered ? 'text-blue-600 border-blue-300 bg-blue-50' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Filter size={14} />
                {isFiltered ? `${selectedCatIds.size}/${categories.length} hạng mục` : 'Lọc hạng mục'}
              </button>
              {showFilter && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowFilter(false)} />
                  <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[220px]">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                      <span className="text-xs font-medium text-gray-700">Chọn hạng mục</span>
                      <div className="flex gap-3">
                        <button onClick={() => setSelectedCatIds(new Set(categories.map(c => c.id)))} className="text-xs text-blue-600 hover:underline">Tất cả</button>
                        <button onClick={() => setSelectedCatIds(new Set())} className="text-xs text-gray-400 hover:underline">Bỏ chọn</button>
                      </div>
                    </div>
                    <div className="space-y-0.5 max-h-52 overflow-y-auto">
                      {categories.map(cat => (
                        <label key={cat.id} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCatIds.has(cat.id)}
                            onChange={e => setSelectedCatIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(cat.id)
                              else next.delete(cat.id)
                              return next
                            })}
                            className="rounded accent-blue-600"
                          />
                          <span className="text-sm text-gray-700">{cat.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {allSuppliers.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSupplierDrop(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                  supplierFilter ? 'text-violet-700 border-violet-300 bg-violet-50' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Filter size={14} />
                {supplierFilter ? supplierFilter : 'Nhà cung cấp'}
              </button>
              {showSupplierDrop && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSupplierDrop(false)} />
                  <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[240px]">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                      <span className="text-xs font-medium text-gray-700">Lọc theo nhà cung cấp</span>
                      {supplierFilter && <button onClick={() => { setSupplierFilter(''); setShowSupplierDrop(false) }} className="text-xs text-gray-400 hover:underline">Xóa lọc</button>}
                    </div>
                    <div className="space-y-0.5 max-h-52 overflow-y-auto">
                      {allSuppliers.map(s => (
                        <button key={s} onClick={() => { setSupplierFilter(s); setShowSupplierDrop(false) }}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-violet-50 transition-colors ${supplierFilter === s ? 'text-violet-700 font-medium bg-violet-50' : 'text-gray-700'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {supplierFilter && (
        <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="font-semibold text-violet-800">{supplierFilter}</span>
          <span className="text-gray-600">Tổng: <span className="font-semibold text-gray-900">{formatVND(supplierTotal)}</span></span>
          <span className="text-green-700">Đã TT: <span className="font-semibold">{formatVND(supplierPaid)}</span></span>
          <span className="text-orange-600">Còn nợ: <span className="font-semibold">{formatVND(supplierOwed)}</span></span>
          <span className="text-gray-500">{supplierTxList.length} khoản chi</span>
          <button onClick={() => setSupplierFilter('')} className="ml-auto text-xs text-violet-500 hover:text-violet-700 hover:underline">✕ Xóa lọc</button>
        </div>
      )}

      {/* Date view */}
      {viewMode === 'date' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {sortedDateTx.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              {dateFilter === 'today' ? 'Hôm nay chưa có khoản chi nào.' : dateFilter === 'week' ? 'Tuần này chưa có khoản chi nào.' : 'Chưa có khoản chi nào.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Ngày</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Loại</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Hạng mục</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Nội dung</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500">Số tiền</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">TT</th>
                    {canSeeHs && <th className="text-left px-4 py-2.5 font-medium text-gray-500">HS</th>}
                    {canEdit && <th className="px-3 py-2.5 w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dateGroups).flatMap(([date, txs]) => {
                    const [y, m, d] = date.split('-').map(Number)
                    const label = new Date(y, m - 1, d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
                    const dayTotal = txs.reduce((s, t) => s + t.amount, 0)
                    const colSpan = canSeeHs ? (canEdit ? 8 : 7) : (canEdit ? 7 : 6)
                    return [
                      <tr key={`h-${date}`} className="bg-gray-50 border-y border-gray-100">
                        <td colSpan={colSpan} className="px-4 py-1.5 text-xs font-semibold text-gray-600">
                          {label}
                          <span className="ml-2 font-normal text-gray-400">{txs.length} khoản · {formatVND(dayTotal)}</span>
                        </td>
                      </tr>,
                      ...txs.map(tx => (
                        <tr key={tx.id} className="hover:bg-blue-50/30 border-b border-gray-50">
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                            {new Date(tx.transaction_date + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                          </td>
                          <td className="px-4 py-2.5">
                            {tx.is_vat_allocation
                              ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"><FileText size={10} /> VAT PB</span>
                              : <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${tx.is_labor ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {tx.is_labor ? <><FileText size={10} /> NC</> : <><Wrench size={10} /> VT</>}
                                </span>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 max-w-[90px] truncate">
                            {categoryMap.get(tx.category_id ?? '') ?? '—'}
                          </td>
                          <td className="px-4 py-2.5 max-w-[180px]">
                            <div className="text-gray-900 truncate">{tx.description}</div>
                            {tx.supplier && <div className="text-xs text-blue-500 truncate mt-0.5">{tx.supplier}</div>}
                            {tx.is_vat_allocation && tx.source_project_id && (
                              <div className="text-xs text-purple-500 truncate mt-0.5">
                                ← {projectNameMap[tx.source_project_id] ?? '?'} · {categoryNameMap[tx.source_category_id ?? ''] ?? '?'}
                              </div>
                            )}
                            {tx.vat_dest_project_id && (
                              <div className="text-xs text-purple-500 truncate mt-0.5">
                                → Phân bổ {formatVND(tx.vat_dest_amount ?? 0)} cho {projectNameMap[tx.vat_dest_project_id] ?? '?'} · {categoryNameMap[tx.vat_dest_category_id ?? ''] ?? '?'}
                              </div>
                            )}
                            {tx.note && <span className={`inline-flex mt-0.5 px-1.5 py-0 rounded text-xs font-medium ${NOTE_COLOR[tx.note] ?? 'bg-gray-100 text-gray-600'}`}>{tx.note}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                            {tx.is_vat_allocation
                              ? <span className="text-purple-600">{formatVND(tx.vat_amount ?? 0)} <span className="text-xs font-normal">(VAT)</span></span>
                              : <span className="text-gray-900">{formatVND(tx.amount)}</span>
                            }
                          </td>
                          <td className="px-4 py-2.5">
                            {tx.is_vat_allocation
                              ? <span className="text-xs text-purple-400">—</span>
                              : <>
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${PAYMENT_COLOR[tx.payment_status]}`}>
                                    {PAYMENT_LABEL[tx.payment_status]}
                                  </span>
                                  {tx.payment_status === 'partial' && tx.actual_paid > 0 && (
                                    <div className="mt-0.5 text-xs">
                                      <span className="text-green-600">+{formatVND(tx.actual_paid)}</span>
                                      <span className="text-orange-500 ml-1">−{formatVND(tx.amount - tx.actual_paid)}</span>
                                    </div>
                                  )}
                                </>
                            }
                          </td>
                          {canSeeHs && (
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => toggleTxVerified(tx.id)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                                  txVerified[tx.id]
                                    ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                                }`}
                              >
                                {txVerified[tx.id] ? '✓ Đã xong' : '○ Chưa xong'}
                              </button>
                            </td>
                          )}
                          {canEdit && (
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setEditTx(tx)} className="p-1 text-gray-300 hover:text-blue-500 rounded transition-colors" title="Chỉnh sửa">
                                  <Pencil size={12} />
                                </button>
                                {otherContractId && (
                                  <button onClick={() => moveTx(tx.id)} className="p-1 text-gray-300 hover:text-violet-500 rounded transition-colors" title={isVat ? 'Chuyển sang HĐ Không VAT' : 'Chuyển sang HĐ Xuất VAT'}>
                                    <ArrowLeftRight size={12} />
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteTx(tx.id)}
                                  disabled={deletingId === tx.id}
                                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors disabled:opacity-40"
                                  title="Xóa"
                                >
                                  {deletingId === tx.id ? <span className="text-xs">...</span> : <Trash2 size={12} />}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Categories accordion */}
      {viewMode === 'category' && (categories.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-sm text-gray-400">
          Chưa có hạng mục. {canEdit ? 'Nhấn "+ Thêm hạng mục" để bắt đầu.' : ''}
        </div>
      ) : visibleCategories.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-sm text-gray-400">
          Chưa chọn hạng mục nào. Nhấn &quot;Lọc hạng mục&quot; để chọn.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCategories.map(cat => {
            const catTx = withFilters(txByCategory(cat.id))
            const vatTx = catTx.filter(t => !t.is_labor)
            const laborTx = catTx.filter(t => t.is_labor)
            const catTotal = catTx.reduce((s, t) => s + t.amount, 0)
            const catVAT = catTx.reduce((s, t) => s + (t.vat_amount ?? 0), 0)
            const catTNCN = catTx.reduce((s, t) => s + (t.tncn_amount ?? 0), 0)
            const catAlloc = incomingByCategory[cat.id] ?? []
            const catAllocTotal = catAlloc.reduce((s, i) => s + i.amount, 0)
            const isExpanded = expandedCats.has(cat.id)

            return (
              <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  {/* Expand/collapse area */}
                  <button
                    onClick={() => toggleCat(cat.id)}
                    className="flex-1 flex items-center gap-3 min-w-0 text-left"
                  >
                    {isExpanded ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
                    <div className="min-w-0 flex items-center gap-2">
                      {editingCatId === cat.id ? (
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editingCatName}
                            onChange={e => setEditingCatName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveCatName(cat.id)
                              if (e.key === 'Escape') setEditingCatId(null)
                            }}
                            className="px-2 py-0.5 border border-blue-400 rounded text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                          />
                          <button onClick={() => saveCatName(cat.id)} disabled={savingCat}
                            className="px-2 py-0.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                            {savingCat ? '...' : 'Lưu'}
                          </button>
                          <button onClick={() => setEditingCatId(null)}
                            className="px-2 py-0.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50">
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium text-gray-900">{cat.name}</span>
                          <span className="text-xs text-gray-500">
                            {catTx.length} khoản · {formatVND(catTotal)}
                            {isVat && catVAT > 0 && ` · VAT: ${formatVND(catVAT)}`}
                            {isVat && catTNCN > 0 && ` · TNCN: ${formatVND(catTNCN)}`}
                          </span>
                          {catAlloc.length > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 whitespace-nowrap">
                              + {catAlloc.length} phân bổ · {formatVND(catAllocTotal)}
                            </span>
                          )}
                          {reverseAlloc[cat.id] && (
                            <span
                              title={reverseAlloc[cat.id].dests.map(d => `${d.name}: ${formatVND(d.amount)}`).join(', ')}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 whitespace-nowrap"
                            >
                              VAT đã chuyển → {[...new Set(reverseAlloc[cat.id].dests.map(d => d.name))].join(', ')}
                              {' '}({formatVND(reverseAlloc[cat.id].total)})
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                  {/* Right side: stats + actions */}
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span className="hidden md:flex items-center gap-1 text-xs text-gray-500">
                      <Wrench size={12} /> Vật tư: <span className="font-medium text-gray-700">{formatVND(vatTx.reduce((s, t) => s + t.amount, 0))}</span>
                    </span>
                    <span className="hidden md:flex items-center gap-1 text-xs text-gray-500">
                      <FileText size={12} /> Nhân công: <span className="font-medium text-gray-700">{formatVND(laborTx.reduce((s, t) => s + t.amount, 0))}</span>
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-1 ml-2 border-l border-gray-100 pl-2">
                        <button
                          onClick={e => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name) }}
                          title="Đổi tên hạng mục"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => onAddTx(cat.id)}
                          title="Thêm khoản chi vào hạng mục này"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                        {otherContractId && catTx.length > 0 && (
                          <button
                            onClick={e => { e.stopPropagation(); moveCategoryTx(cat.id, cat.name, catTx.length) }}
                            title={isVat ? 'Chuyển hạng mục sang HĐ Không VAT' : 'Chuyển hạng mục sang HĐ Xuất VAT'}
                            className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                          >
                            <ArrowLeftRight size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteCat(cat.id, cat.name, catTx.length)}
                          title={catTx.length > 0 ? 'Xóa khoản chi trước' : 'Xóa hạng mục'}
                          className={`p-1.5 rounded-lg transition-colors ${catTx.length > 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {catTx.length === 0 && catAlloc.length === 0 ? (
                      <div className="flex items-center justify-between px-5 py-4">
                        <p className="text-sm text-gray-400">Chưa có khoản chi nào trong hạng mục này.</p>
                        {canEdit && (
                          <button
                            onClick={() => onAddTx(cat.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                          >
                            <Plus size={12} /> Thêm khoản chi
                          </button>
                        )}
                      </div>
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
                                  <th className="text-left px-5 py-2.5 font-medium text-gray-500">Hóa đơn / Hợp đồng NC</th>
                                </>
                              )}
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">TT</th>
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Đơn vị nhập</th>
                              {canSeeHs && <th className="text-left px-5 py-2.5 font-medium text-gray-500">HS</th>}
                              {canEdit && <th className="px-3 py-2.5" />}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {catTx.map(tx => (
                              <tr key={tx.id} className="hover:bg-blue-50/30">
                                <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                                  {new Date(tx.transaction_date).toLocaleDateString('vi-VN')}
                                </td>
                                <td className="px-5 py-2.5">
                                  {tx.is_vat_allocation
                                    ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"><FileText size={10} /> VAT PB</span>
                                    : <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${tx.is_labor ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {tx.is_labor ? <><FileText size={10} /> NC</> : <><Wrench size={10} /> VT</>}
                                      </span>
                                  }
                                </td>
                                <td className="px-5 py-2.5 max-w-[220px]">
                                  <div className="text-gray-900 truncate">{tx.description}</div>
                                  {tx.supplier && <div className="text-xs text-blue-500 truncate mt-0.5">{tx.supplier}</div>}
                                  {tx.is_vat_allocation && tx.source_project_id && (
                                    <div className="text-xs text-purple-500 truncate mt-0.5">
                                      ← {projectNameMap[tx.source_project_id] ?? '?'} · {categoryNameMap[tx.source_category_id ?? ''] ?? '?'}
                                    </div>
                                  )}
                                  {tx.vat_dest_project_id && (
                                    <div className="text-xs text-purple-500 truncate mt-0.5">
                                      → Phân bổ {formatVND(tx.vat_dest_amount ?? 0)} cho {projectNameMap[tx.vat_dest_project_id] ?? '?'} · {categoryNameMap[tx.vat_dest_category_id ?? ''] ?? '?'}
                                    </div>
                                  )}
                                  {tx.note && <span className={`inline-flex mt-0.5 px-1.5 py-0 rounded text-xs font-medium ${NOTE_COLOR[tx.note] ?? 'bg-gray-100 text-gray-600'}`}>{tx.note}</span>}
                                </td>
                                <td className="px-5 py-2.5 text-right font-medium whitespace-nowrap">
                                  {tx.is_vat_allocation
                                    ? <span className="text-purple-600">{formatVND(tx.vat_amount ?? 0)} <span className="text-xs font-normal">(VAT)</span></span>
                                    : <span className="text-gray-900">{formatVND(tx.amount)}</span>
                                  }
                                </td>
                                {isVat && (
                                  <>
                                    <td className="px-5 py-2.5 text-gray-600">
                                      {tx.is_vat_allocation ? VAT_LABEL[tx.vat_rate] + ' (PB)' : tx.is_labor ? 'TNCN 10%' : VAT_LABEL[tx.vat_rate]}
                                    </td>
                                    <td className="px-5 py-2.5 text-right text-purple-600 whitespace-nowrap">
                                      {tx.is_labor
                                        ? formatVND(tx.tncn_amount ?? 0)
                                        : formatVND(tx.vat_amount ?? 0)
                                      }
                                    </td>
                                    <td className="px-5 py-2.5">
                                      {tx.is_vat_allocation ? (
                                        <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-500">Phân bổ VAT</span>
                                      ) : tx.is_labor ? (
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${tx.labor_contract_status === 'signed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                          {tx.labor_contract_status === 'signed' ? 'Có hợp đồng' : 'Không hợp đồng'}
                                        </span>
                                      ) : (
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                                          tx.invoice_status === 'has_invoice' ? 'bg-green-100 text-green-700'
                                          : tx.invoice_status === 'waiting' ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-gray-100 text-gray-500'
                                        }`}>
                                          {tx.invoice_status === 'has_invoice' ? 'Đã có hóa đơn' : tx.invoice_status === 'waiting' ? 'Chờ hóa đơn' : 'Không hóa đơn'}
                                        </span>
                                      )}
                                    </td>
                                  </>
                                )}
                                <td className="px-5 py-2.5">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${PAYMENT_COLOR[tx.payment_status]}`}>
                                    {PAYMENT_LABEL[tx.payment_status]}
                                  </span>
                                  {tx.payment_status === 'partial' && tx.actual_paid > 0 && (
                                    <div className="mt-0.5 text-xs space-y-0.5">
                                      <div><span className="text-green-600 font-medium">Đã TT: {formatVND(tx.actual_paid)}</span></div>
                                      <div><span className="text-orange-500 font-medium">Còn: {formatVND(tx.amount - tx.actual_paid)}</span></div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-5 py-2.5 text-gray-500">{tx.unit}</td>
                                {canSeeHs && (
                                  <td className="px-5 py-2.5">
                                    <button
                                      onClick={() => toggleTxVerified(tx.id)}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                                        txVerified[tx.id]
                                          ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                                      }`}
                                    >
                                      {txVerified[tx.id] ? '✓ Đã xong' : '○ Chưa xong'}
                                    </button>
                                  </td>
                                )}
                                {canEdit && (
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setEditTx(tx)}
                                        className="p-1 text-gray-300 hover:text-blue-500 rounded transition-colors"
                                        title="Chỉnh sửa"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      {otherContractId && (
                                        <button
                                          onClick={() => moveTx(tx.id)}
                                          className="p-1 text-gray-300 hover:text-violet-500 rounded transition-colors"
                                          title={isVat ? 'Chuyển sang HĐ Không VAT' : 'Chuyển sang HĐ Xuất VAT'}
                                        >
                                          <ArrowLeftRight size={12} />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => deleteTx(tx.id)}
                                        disabled={deletingId === tx.id}
                                        className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors disabled:opacity-40"
                                        title="Xóa"
                                      >
                                        {deletingId === tx.id ? <span className="text-xs">...</span> : <Trash2 size={12} />}
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                            {catAlloc.map(item => (
                              <tr key={`alloc-${item.id}`} className="bg-purple-50/30 hover:bg-purple-50/50">
                                <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                                  {new Date(item.date + 'T00:00:00').toLocaleDateString('vi-VN')}
                                </td>
                                <td className="px-5 py-2.5">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                    <FileText size={10} /> Phân bổ
                                  </span>
                                </td>
                                <td className="px-5 py-2.5 max-w-[220px]">
                                  <div className="text-gray-900 truncate">{item.description}</div>
                                  <div className="text-xs text-purple-500 truncate mt-0.5">
                                    ← {item.sourceProjectName} · {item.sourceCategoryName}
                                  </div>
                                </td>
                                <td className="px-5 py-2.5 text-right font-medium whitespace-nowrap">
                                  <span className="text-gray-300 text-xs">—</span>
                                </td>
                                {isVat && (
                                  <>
                                    <td className="px-5 py-2.5 text-gray-600">Phân bổ</td>
                                    <td className="px-5 py-2.5 text-right text-purple-600 whitespace-nowrap">
                                      {formatVND(item.amount)}
                                    </td>
                                    <td className="px-5 py-2.5">
                                      <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-500">Từ công trình khác</span>
                                    </td>
                                  </>
                                )}
                                <td className="px-5 py-2.5">
                                  <span className="text-gray-300 text-xs">—</span>
                                </td>
                                <td className="px-5 py-2.5 text-gray-500">—</td>
                                {canSeeHs && <td className="px-5 py-2.5" />}
                                {canEdit && <td className="px-3 py-2.5" />}
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
      ))}

      {/* Modal: Chi tiết chưa thanh toán */}
      {showUnpaidDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Chi tiết chưa thanh toán</h2>
                <p className="text-xs text-gray-500 mt-0.5">Tổng <strong className="text-orange-600">{formatVND(unpaid)}</strong></p>
              </div>
              <button onClick={() => setShowUnpaidDetail(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto divide-y divide-gray-50">
              {unpaidItems.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400 text-center italic">Không có khoản nào chưa thanh toán.</p>
              ) : unpaidItems.map(t => (
                <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-xs text-gray-400 tabular-nums w-20 shrink-0">
                    {new Date(t.transaction_date.slice(0, 10) + 'T00:00:00').toLocaleDateString('vi-VN')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{t.description || categoryMap.get(t.category_id ?? '') || 'Khoản chi'}</span>
                    {t.category_id && <span className="ml-2 text-xs text-gray-400">{categoryMap.get(t.category_id)}</span>}
                    {t.is_labor && <span className="ml-1.5 text-xs text-purple-500">· Nhân công</span>}
                    {t.supplier && <span className="ml-1.5 text-xs text-gray-400">· {t.supplier}</span>}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatVND(t.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết CP không hợp lệ VAT */}
      {showInvalidVatDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Vật tư không có hóa đơn VAT</h2>
                <p className="text-xs text-gray-500 mt-0.5">Tổng <strong className="text-red-700">{formatVND(khongHopLeVT)}</strong></p>
              </div>
              <button onClick={() => setShowInvalidVatDetail(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto divide-y divide-gray-50">
              {invalidVatItems.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400 text-center italic">Không có khoản vật tư nào thiếu hóa đơn VAT.</p>
              ) : invalidVatItems.map(t => (
                <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-xs text-gray-400 tabular-nums w-20 shrink-0">
                    {new Date(t.transaction_date.slice(0, 10) + 'T00:00:00').toLocaleDateString('vi-VN')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{t.description || categoryMap.get(t.category_id ?? '') || 'Khoản chi'}</span>
                    {t.category_id && <span className="ml-2 text-xs text-gray-400">{categoryMap.get(t.category_id)}</span>}
                    {t.supplier && <span className="ml-1.5 text-xs text-gray-400">· {t.supplier}</span>}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatVND(t.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editTx && (
        editTx.is_vat_allocation ? (
          <EditVatAllocModal
            tx={editTx}
            projectId={projectId}
            onClose={() => { setEditTx(null); router.refresh() }}
          />
        ) : (
          <EditTransactionModal
            tx={editTx}
            categories={categories}
            isVat={isVat}
            userId={userId}
            role={role}
            projectId={projectId}
            onClose={() => { setEditTx(null); router.refresh() }}
          />
        )
      )}
    </div>
  )
}

function EditTransactionModal({ tx, categories, isVat, userId, role, projectId, onClose }: {
  tx: Transaction
  categories: Category[]
  isVat: boolean
  userId: string
  role: UserRole
  projectId: string
  onClose: () => void
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [isLabor, setIsLabor] = useState(tx.is_labor ?? false)
  const [description, setDescription] = useState(tx.description ?? '')
  const [amount, setAmount] = useState(String(tx.amount))
  const [date, setDate] = useState(tx.transaction_date.slice(0, 10))
  const [paymentStatus, setPaymentStatus] = useState(tx.payment_status)
  const [paymentDate, setPaymentDate] = useState(tx.payment_date?.slice(0, 10) ?? '')
  const [vatRate, setVatRate] = useState<VatRate>(tx.vat_rate ?? 'no_vat')
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>(tx.invoice_status ?? 'no_invoice')
  const [invoiceNumber, setInvoiceNumber] = useState(tx.invoice_number ?? '')
  const [laborContractStatus, setLaborContractStatus] = useState<ContractStatus>(tx.labor_contract_status ?? 'not_signed')
  const [unit, setUnit] = useState(tx.unit ?? '')
  const [categoryId, setCategoryId] = useState(tx.category_id ?? '')
  const [supplier, setSupplier] = useState(tx.supplier ?? '')
  const [note, setNote] = useState(tx.note ?? '')
  const [supplierList, setSupplierList] = useState<{ id: string; name: string; tax_code?: string; phone?: string }[]>([])
  const [showSupplierDrop, setShowSupplierDrop] = useState(false)

  // Phân bổ — khoản chi này tính đủ sang công trình/hạng mục khác:
  //   Vật tư = đủ số tiền (amount đã gồm VAT) · Nhân công = chi phí gốc + 10% TNCN đã đóng
  const [vatAllocOn, setVatAllocOn] = useState(!!tx.vat_dest_project_id)
  const [vatDestProjects, setVatDestProjects] = useState<{ id: string; name: string }[]>([])
  const [vatDestProjectId, setVatDestProjectId] = useState(tx.vat_dest_project_id ?? '')
  const [vatDestCategories, setVatDestCategories] = useState<{ id: string; name: string }[]>([])
  const [vatDestCategoryId, setVatDestCategoryId] = useState(tx.vat_dest_category_id ?? '')
  const [loadingVatDestCats, setLoadingVatDestCats] = useState(false)

  useEffect(() => {
    if (!vatAllocOn) return
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => { if (data) setVatDestProjects(data) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatAllocOn])

  useEffect(() => {
    if (!vatDestProjectId) { setVatDestCategories([]); return }
    setLoadingVatDestCats(true)
    supabase.from('categories').select('id, name').eq('project_id', vatDestProjectId).order('sort_order')
      .then(({ data }) => {
        setVatDestCategories(data ?? [])
        setLoadingVatDestCats(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatDestProjectId])

  // Payment history
  const [paymentHistory, setPaymentHistory] = useState<PaymentEntry[]>(() => {
    const h = (tx.payment_history as PaymentEntry[] | null) ?? []
    if (h.length === 0 && tx.actual_paid > 0 && tx.payment_status === 'partial') {
      return [{ amount: tx.actual_paid, date: tx.payment_date?.slice(0, 10) ?? '', method: tx.note ?? '' }]
    }
    return h
  })
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [newPayAmount, setNewPayAmount] = useState('')
  const [newPayDate, setNewPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [newPayMethod, setNewPayMethod] = useState('')

  // Auto-update payment status when history changes
  useEffect(() => {
    if (paymentHistory.length === 0) return
    const parsedAmt = parseInt(amount || '0', 10)
    const total = paymentHistory.reduce((s, p) => s + p.amount, 0)
    if (parsedAmt > 0 && total >= parsedAmt) setPaymentStatus('paid')
    else if (total > 0) setPaymentStatus('partial')
  }, [paymentHistory, amount])

  useEffect(() => {
    supabase.from('suppliers').select('id, name, tax_code, phone').order('name')
      .then(({ data }) => { if (data) setSupplierList(data) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredSuppliers = supplierList.filter(s =>
    !supplier || s.name.toLowerCase().includes(supplier.toLowerCase())
  )

  function addPaymentEntry() {
    const amt = parseInt(newPayAmount.replace(/[^\d]/g, '') || '0', 10)
    if (amt <= 0) return
    setPaymentHistory(prev => [...prev, { amount: amt, date: newPayDate, method: newPayMethod }])
    setNewPayAmount('')
    setNewPayDate(new Date().toISOString().slice(0, 10))
    setNewPayMethod('')
    setShowAddPayment(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const parsedAmount = parseInt(amount || '0', 10) || 0
    const vatAmount = (!isLabor && isVat) ? calcVAT(parsedAmount, vatRate) : 0
    const tncnAmount = (isLabor && isVat && laborContractStatus === 'signed') ? calcTNCN(parsedAmount) : 0

    const historyTotal = paymentHistory.reduce((s, p) => s + p.amount, 0)
    const finalActualPaid = paymentHistory.length > 0
      ? historyTotal
      : paymentStatus === 'paid' ? parsedAmount : 0
    const finalStatus = paymentHistory.length > 0
      ? (historyTotal >= parsedAmount ? 'paid' : historyTotal > 0 ? 'partial' : 'pending')
      : paymentStatus
    // Vừa chuyển sang Đã TT/TT một phần mà không nhập ngày → mặc định hôm nay
    // (ngày tiền thật rời kênh, dòng tiền dùng ngày này để so với chốt sổ)
    const statusJustSettled = finalStatus !== tx.payment_status &&
      (finalStatus === 'paid' || finalStatus === 'partial')
    const lastPayDate = paymentHistory.length > 0
      ? paymentHistory[paymentHistory.length - 1].date
      : (paymentDate || (statusJustSettled ? new Date().toISOString().slice(0, 10) : null))

    const newLaborContractStatus = isLabor ? laborContractStatus : tx.labor_contract_status
    const newInvoiceStatus = !isLabor ? invoiceStatus : tx.invoice_status

    if (vatAllocOn && (!vatDestProjectId || !vatDestCategoryId || allocAmount <= 0)) {
      alert('Phân bổ: vui lòng chọn Công trình nhận và Hạng mục nhận (số tiền phân bổ tự tính, phải lớn hơn 0).')
      setLoading(false)
      return
    }

    await supabase.from('transactions').update({
      description,
      amount: parsedAmount,
      transaction_date: date,
      payment_status: finalStatus,
      is_labor: isLabor,
      vat_rate: !isLabor ? vatRate : tx.vat_rate,
      vat_amount: vatAmount,
      tncn_amount: tncnAmount,
      invoice_status: newInvoiceStatus,
      labor_contract_status: newLaborContractStatus,
      unit,
      category_id: categoryId || tx.category_id,
      supplier: supplier || null,
      note: note || null,
      payment_date: lastPayDate || null,
      next_payment_date: null,
      actual_paid: finalActualPaid,
      payment_history: paymentHistory.length > 0 ? paymentHistory : null,
      invoice_number: !isLabor ? (invoiceNumber || null) : tx.invoice_number,
      vat_dest_project_id: vatAllocOn ? vatDestProjectId : null,
      vat_dest_category_id: vatAllocOn ? vatDestCategoryId : null,
      vat_dest_amount: vatAllocOn ? allocAmount : 0,
    }).eq('id', tx.id)

    // Ghi audit log cho từng field thay đổi
    const changes: { field_name: string; old_value: string; new_value: string }[] = []
    if (description !== tx.description) changes.push({ field_name: 'description', old_value: tx.description ?? '', new_value: description })
    if (parsedAmount !== tx.amount) changes.push({ field_name: 'amount', old_value: String(tx.amount), new_value: String(parsedAmount) })
    if (finalStatus !== tx.payment_status) changes.push({ field_name: 'payment_status', old_value: tx.payment_status, new_value: finalStatus })
    if (newLaborContractStatus !== tx.labor_contract_status) changes.push({ field_name: 'labor_contract_status', old_value: tx.labor_contract_status ?? '', new_value: newLaborContractStatus ?? '' })
    if (newInvoiceStatus !== tx.invoice_status) changes.push({ field_name: 'invoice_status', old_value: tx.invoice_status ?? '', new_value: newInvoiceStatus ?? '' })
    if (supplier !== (tx.supplier ?? '')) changes.push({ field_name: 'supplier', old_value: tx.supplier ?? '', new_value: supplier })
    if (categoryId && categoryId !== tx.category_id) changes.push({ field_name: 'category_id', old_value: tx.category_id ?? '', new_value: categoryId })
    if (isLabor !== (tx.is_labor ?? false)) changes.push({ field_name: 'is_labor', old_value: String(tx.is_labor ?? false), new_value: String(isLabor) })

    if (changes.length > 0) {
      await supabase.from('audit_logs').insert(
        changes.map(c => ({
          transaction_id: tx.id,
          changed_by: userId,
          changed_at: new Date().toISOString(),
          field_name: c.field_name,
          old_value: c.old_value,
          new_value: c.new_value,
          user_role: role,
        }))
      )
    }

    onClose()
  }

  const historyTotal = paymentHistory.reduce((s, p) => s + p.amount, 0)
  const parsedAmt = parseInt(amount || '0', 10)
  // Số tiền phân bổ tự tính: Vật tư = đủ số tiền (đã gồm VAT) · Nhân công = gốc + 10% TNCN (nếu có hợp đồng)
  const allocAmount = !isLabor
    ? parsedAmt
    : parsedAmt + (laborContractStatus === 'signed' ? calcTNCN(parsedAmt) : 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-gray-900">Chỉnh sửa khoản chi</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isLabor ? 'Nhân công' : 'Vật tư'} · {new Date(tx.transaction_date).toLocaleDateString('vi-VN')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Loại khoản chi</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button type="button"
                onClick={() => setIsLabor(false)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${!isLabor ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                🔧 Vật tư
              </button>
              <button type="button"
                onClick={() => setIsLabor(true)}
                className={`flex-1 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${isLabor ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                👷 Nhân công
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hạng mục</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nội dung</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">Nhà cung cấp / Nhà thầu</label>
            <input
              value={supplier}
              onChange={e => { setSupplier(e.target.value); setShowSupplierDrop(true) }}
              onFocus={() => setShowSupplierDrop(true)}
              placeholder="Nhập tên hoặc chọn từ danh sách..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showSupplierDrop && filteredSuppliers.length > 0 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSupplierDrop(false)} />
                <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {filteredSuppliers.map(s => (
                    <button key={s.id} type="button"
                      onClick={() => { setSupplier(s.name); setShowSupplierDrop(false) }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center gap-2">
                      <span className="font-medium text-gray-800">{s.name}</span>
                      {s.tax_code && <span className="text-xs text-gray-400">MST: {s.tax_code}</span>}
                      {s.phone && <span className="text-xs text-gray-400">{s.phone}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND)</label>
              <input type="number" step="1" value={amount} onChange={e => setAmount(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {amount && parseInt(amount) !== 0 && (
                <p className="text-xs text-gray-500 mt-0.5 font-medium">{formatVND(parseInt(amount))}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày phát sinh / Ngày HĐ</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Payment status + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái TT</label>
              {paymentHistory.length > 0 ? (
                <div className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                  historyTotal >= parsedAmt && parsedAmt > 0
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                }`}>
                  {historyTotal >= parsedAmt && parsedAmt > 0 ? 'Đã TT' : 'TT một phần'}
                  <span className="ml-1 text-xs opacity-70">(tự động)</span>
                </div>
              ) : (
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as Transaction['payment_status'])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="pending">Chưa TT</option>
                  <option value="paid">Đã TT</option>
                  <option value="partial">TT một phần</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {paymentHistory.length > 0 ? 'Ngày TT gần nhất' : 'Ngày thanh toán'}
              </label>
              <input type="date"
                value={paymentHistory.length > 0
                  ? (paymentHistory[paymentHistory.length - 1].date)
                  : paymentDate}
                onChange={e => { if (paymentHistory.length === 0) setPaymentDate(e.target.value) }}
                readOnly={paymentHistory.length > 0}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${paymentHistory.length > 0 ? 'bg-gray-50 text-gray-500' : ''}`}
              />
            </div>
          </div>

          {/* Payment history section — shows when partial or already has history */}
          {(paymentStatus === 'partial' || paymentHistory.length > 0) && (
            <div className="border border-orange-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="bg-orange-50 px-4 py-2.5 flex items-center justify-between border-b border-orange-100">
                <div className="flex items-center gap-1.5">
                  <History size={13} className="text-orange-600" />
                  <span className="text-xs font-semibold text-orange-800">Lịch sử thanh toán</span>
                  {paymentHistory.length > 0 && (
                    <span className="text-xs text-orange-600 ml-1">
                      · Đã TT {formatVND(historyTotal)}{parsedAmt > 0 ? ` / ${formatVND(parsedAmt)}` : ''}
                    </span>
                  )}
                </div>
                {!showAddPayment && (
                  <button type="button" onClick={() => setShowAddPayment(true)}
                    className="flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 border border-orange-300 bg-white rounded-lg px-2 py-0.5">
                    <Plus size={11} /> Ghi nhận TT
                  </button>
                )}
              </div>

              {/* History entries */}
              {paymentHistory.length > 0 && (
                <div className="divide-y divide-orange-50">
                  {paymentHistory.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-orange-50/30">
                      <div className="flex items-center gap-2.5">
                        <span className="text-orange-600 font-semibold">Đợt {i + 1}</span>
                        <span className="text-gray-500">
                          {p.date ? new Date(p.date + 'T00:00:00').toLocaleDateString('vi-VN') : '—'}
                        </span>
                        {p.method && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${NOTE_COLOR[p.method] ?? 'bg-gray-100 text-gray-600'}`}>
                            {p.method}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{formatVND(p.amount)}</span>
                        <button type="button" onClick={() => setPaymentHistory(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {paymentHistory.length === 0 && !showAddPayment && (
                <div className="px-4 py-4 text-xs text-gray-400 text-center">
                  Chưa có đợt thanh toán nào. Nhấn &quot;Ghi nhận TT&quot; để thêm.
                </div>
              )}

              {/* Add new payment form */}
              {showAddPayment && (
                <div className="px-4 py-3 space-y-2.5 bg-orange-50/40 border-t border-orange-100">
                  <p className="text-xs font-semibold text-orange-700">Đợt {paymentHistory.length + 1}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-orange-700 font-medium mb-1">Ngày thanh toán</label>
                      <input type="date" value={newPayDate} onChange={e => setNewPayDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-orange-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-orange-700 font-medium mb-1">Số tiền *</label>
                      <input type="number" min="0" value={newPayAmount} onChange={e => setNewPayAmount(e.target.value)}
                        placeholder="VD: 50000000"
                        className="w-full px-2.5 py-1.5 border border-orange-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400" />
                      {newPayAmount && parseInt(newPayAmount) > 0 && (
                        <p className="text-xs text-orange-600 mt-0.5">{formatVND(parseInt(newPayAmount))}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-orange-700 font-medium mb-1">Hình thức TT</label>
                    <select value={newPayMethod} onChange={e => setNewPayMethod(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-orange-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400">
                      <option value="">-- Chưa chọn --</option>
                      <option value="TM">Tiền mặt (TM)</option>
                      <option value="CK CTY">CK Công ty (CK CTY)</option>
                      <option value="CK CN">CK Cá nhân (CK CN)</option>
                      <option value="Từ quỹ ứng">GS chi từ quỹ đã ứng</option>
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <button type="button" onClick={() => {
                      setShowAddPayment(false)
                      setNewPayAmount('')
                      setNewPayDate(new Date().toISOString().slice(0, 10))
                      setNewPayMethod('')
                    }}
                      className="px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
                    <button type="button" onClick={addPaymentEntry}
                      disabled={!newPayAmount || parseInt(newPayAmount) <= 0}
                      className="px-3 py-1 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:bg-orange-300">
                      Thêm vào lịch sử
                    </button>
                  </div>
                </div>
              )}

              {/* Footer summary */}
              {paymentHistory.length > 0 && parsedAmt > 0 && (
                <div className="px-4 py-2 bg-orange-50 border-t border-orange-100 flex items-center justify-between text-xs">
                  <span className="text-orange-700 font-medium">
                    {paymentHistory.length} đợt · {formatVND(historyTotal)}
                  </span>
                  {historyTotal >= parsedAmt
                    ? <span className="text-green-600 font-semibold">✓ Đã thanh toán đủ</span>
                    : <span className="text-orange-600">Còn thiếu: <span className="font-semibold">{formatVND(parsedAmt - historyTotal)}</span></span>
                  }
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Đơn vị</label>
            <input type="text" value={unit} onChange={e => setUnit(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {isVat && !isLabor && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Thuế GTGT</label>
                  <select value={vatRate} onChange={e => setVatRate(e.target.value as VatRate)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="vat_10">VAT 10%</option>
                    <option value="vat_8">VAT 8%</option>
                    <option value="no_vat">Không VAT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Hóa đơn</label>
                  <select value={invoiceStatus} onChange={e => setInvoiceStatus(e.target.value as InvoiceStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="has_invoice">Đã có hóa đơn</option>
                    <option value="waiting">Chờ hóa đơn</option>
                    <option value="no_invoice">Không hóa đơn</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số hóa đơn</label>
                <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="Nhập số hóa đơn..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </>
          )}
          {isVat && isLabor && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hợp đồng nhân công</label>
              <select value={laborContractStatus} onChange={e => setLaborContractStatus(e.target.value as ContractStatus)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="signed">Có hợp đồng</option>
                <option value="not_signed">Không hợp đồng</option>
              </select>
            </div>
          )}

          {/* Phân bổ VAT — khoản chi này có hóa đơn VAT thật, khấu trừ hộ công trình khác */}
          {(
            <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-purple-700 cursor-pointer">
                <input type="checkbox" checked={vatAllocOn} onChange={e => setVatAllocOn(e.target.checked)}
                  className="accent-purple-600" />
                Phân bổ khoản chi này cho công trình khác (VT có hóa đơn VAT hoặc NC có TNCN)
              </label>
              {vatAllocOn && (
                <>
                  <p className="text-xs text-purple-500">Chỉ để tham khảo tổng chi phí đã phân bổ vào hợp đồng VAT của công trình nhận — không đổi số tiền/loại VAT của khoản chi này, không tính vào chi phí thật.</p>
                  <div className="bg-white border border-purple-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-500">Số tiền phân bổ (tự tính)</p>
                    <p className="text-sm font-semibold text-purple-700">{formatVND(allocAmount)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {isLabor ? 'Chi phí gốc + 10% TNCN đã đóng' : 'Đủ số tiền khoản chi (đã gồm VAT)'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Công trình nhận phân bổ <span className="text-red-500">*</span></label>
                      <select value={vatDestProjectId} onChange={e => { setVatDestProjectId(e.target.value); setVatDestCategoryId('') }}
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                        <option value="">-- Chọn công trình --</option>
                        {vatDestProjects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}{p.id === projectId ? ' (công trình này)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Hạng mục nhận <span className="text-red-500">*</span></label>
                      <select value={vatDestCategoryId} onChange={e => setVatDestCategoryId(e.target.value)}
                        disabled={!vatDestProjectId || loadingVatDestCats}
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:text-gray-400">
                        <option value="">{loadingVatDestCats ? 'Đang tải...' : '-- Chọn hạng mục --'}</option>
                        {vatDestCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hình thức TT (chung)</label>
            <select value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Chưa chọn --</option>
              <option value="TM">Tiền mặt (TM)</option>
              <option value="CK CTY">CK Công ty (CK CTY)</option>
              <option value="CK CN">CK Cá nhân (CK CN)</option>
              <option value="Từ quỹ ứng">GS chi từ quỹ đã ứng</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RevenueTab({
  revenue, totalRevenue, collectedRevenue, canEdit, canSeeStages, onAdd, onEdit, onDelete
}: {
  revenue: Revenue[]
  totalRevenue: number
  collectedRevenue: number
  canEdit: boolean
  canSeeStages: boolean
  onAdd: () => void
  onEdit: (r: Revenue) => void
  onDelete: (id: string, stage: string) => void
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

      {canSeeStages && canEdit && (
        <div>
          <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            <Plus size={14} /> Thêm đợt thu
          </button>
        </div>
      )}

      {canSeeStages && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {revenue.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">Chưa có đợt thu tiền nào.</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Đợt</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Số tiền</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Ngày thu</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Trạng thái</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Hình thức</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Ghi chú</th>
                  {canEdit && <th className="px-3 py-3 w-16" />}
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
                    {canEdit && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onEdit(r)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => onDelete(r.id, r.stage)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
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
}

const FIELD_LABEL: Record<string, string> = {
  description: 'Nội dung',
  amount: 'Số tiền',
  payment_status: 'Trạng thái TT',
  labor_contract_status: 'Hợp đồng nhân công',
  invoice_status: 'Hóa đơn',
  supplier: 'Nhà cung cấp',
  category_id: 'Hạng mục',
}

const VALUE_LABEL: Record<string, string> = {
  pending: 'Chưa TT',
  paid: 'Đã TT',
  partial: 'TT một phần',
  signed: 'Có hợp đồng',
  not_signed: 'Không hợp đồng',
  has_invoice: 'Đã có hóa đơn',
  waiting: 'Chờ hóa đơn',
  no_invoice: 'Không hóa đơn',
}

function AuditTab({ logs, transactions, categories, onOpenTx }: {
  logs: AuditLog[]
  transactions: Transaction[]
  categories: Category[]
  onOpenTx?: (tx: Transaction) => void
}) {
  const txMap = new Map(transactions.map(t => [t.id, t]))
  const catName = (id?: string | null) => categories.find(c => c.id === id)?.name

  // Dịch giá trị log ra chữ dễ đọc: UUID hạng mục → tên, số tiền → có dấu chấm
  const fmtVal = (field: string, v?: string) => {
    if (!v) return '(trống)'
    if (field === 'category_id') return catName(v) ?? '(hạng mục đã xóa)'
    if (field === 'amount') {
      const n = Number(v)
      return isNaN(n) ? v : n.toLocaleString('vi-VN') + ' đ'
    }
    return VALUE_LABEL[v] ?? v
  }

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
        {logs.map(log => {
          const tx = log.transaction_id ? txMap.get(log.transaction_id) : undefined
          const txCat = tx ? catName(tx.category_id) : undefined
          return (
            <div key={log.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm">
                  <span className="font-medium text-gray-900">{log.profiles?.full_name ?? 'Người dùng'}</span>
                  <span className="text-gray-500"> chỉnh sửa </span>
                  <span className="font-medium text-gray-700">{FIELD_LABEL[log.field_name] ?? log.field_name}</span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(log.changed_at).toLocaleString('vi-VN')}
                </span>
              </div>
              {/* Khoản chi nào bị sửa — nhấp để mở thẳng khoản chi */}
              <p className="text-xs mt-0.5">
                <span className="text-gray-400">Khoản chi: </span>
                {tx ? (
                  <button
                    type="button"
                    onClick={() => onOpenTx?.(tx)}
                    className="text-blue-600 font-medium hover:text-blue-800 hover:underline cursor-pointer"
                  >
                    {tx.description}
                  </button>
                ) : (
                  <span className="text-gray-700 font-medium">(khoản chi đã xóa)</span>
                )}
                {txCat && <span className="text-gray-400"> · {txCat}</span>}
                {tx && <span className="text-gray-400"> · {new Date(tx.transaction_date).toLocaleDateString('vi-VN')}</span>}
              </p>
              {(log.old_value || log.new_value) && (
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span className="line-through text-red-500">{fmtVal(log.field_name, log.old_value)}</span>
                  <span>→</span>
                  <span className="text-green-600">{fmtVal(log.field_name, log.new_value)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
