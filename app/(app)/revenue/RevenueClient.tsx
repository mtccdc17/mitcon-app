'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatVND, formatVNDShort } from '@/lib/utils'
import { Plus, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AddRevenueEntryModal from './AddRevenueEntryModal'
import EditRevenueModal from './EditRevenueModal'
import CashflowBox, { CashflowData } from '@/components/CashflowBox'
import CashflowHistoryModal from '@/components/CashflowHistoryModal'
import CashflowAsOfModal from '@/components/CashflowAsOfModal'

const CONTRACT_LABEL: Record<string, string> = { vat: 'HĐ Xuất VAT', no_vat: 'HĐ Không VAT' }

interface Project { id: string; name: string }
interface ContractRow { id: string; project_id: string; type: string; value: number }
const CHANNEL_LABEL: Record<string, string> = { tk_cty: 'TK Công ty', tk_cn: 'TK Cá nhân', tm: 'Tiền mặt' }
const CHANNEL_STYLE: Record<string, string> = {
  tk_cty: 'bg-blue-100 text-blue-700',
  tk_cn:  'bg-purple-100 text-purple-700',
  tm:     'bg-orange-100 text-orange-700',
}

interface RevenueRow {
  id: string
  project_id: string
  contract_id?: string | null
  stage: string
  amount: number
  collected_date?: string | null
  payment_method: string
  payment_channel?: string | null
  status: string
  note?: string | null
}

interface PersonalExpense {
  id: string; date: string; description: string; category: string; channel: string; amount: number; notes?: string | null
}
interface PersonalLoan {
  id: string; date: string; description: string; amount: number; repaid_amount: number; notes?: string | null
}

interface Props {
  projects: Project[]
  contracts: ContractRow[]
  revenue: RevenueRow[]
  isCeo: boolean
  userId: string
  cashflow: CashflowData
  personalExpenses?: PersonalExpense[]
  personalLoans?: PersonalLoan[]
}

function RevenueTable({
  entries,
  contractValue,
  qtValue,
  isCeo,
  onEdit,
  onDelete,
}: {
  entries: RevenueRow[]
  contractValue: number
  qtValue: number
  isCeo: boolean
  onEdit: (r: RevenueRow) => void
  onDelete: (id: string, stage: string) => void
}) {
  if (entries.length === 0) return (
    <p className="px-5 py-4 text-xs text-gray-400 italic">Chưa có đợt thu nào.</p>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-100 bg-white">
            <th className="text-left px-5 py-2.5 font-medium">Đợt thu</th>
            {isCeo && <th className="text-right px-4 py-2.5 font-medium">Giá trị HĐ</th>}
            {isCeo && <th className="text-right px-4 py-2.5 font-medium">Giá trị QT cuối</th>}
            {isCeo && <th className="text-right px-5 py-2.5 font-medium">Số tiền đợt</th>}
            <th className="text-left px-5 py-2.5 font-medium">Ngày thu</th>
            <th className="text-left px-5 py-2.5 font-medium">Trạng thái</th>
            <th className="text-left px-5 py-2.5 font-medium hidden md:table-cell">Kênh thu</th>
            {isCeo && <th className="px-3 py-2.5 w-16" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {entries.map(r => (
            <tr key={r.id} className="hover:bg-gray-50 group">
              <td className="px-5 py-3 text-gray-900 font-medium">
                {r.stage}
                {r.note && <span className="ml-1.5 text-xs text-gray-400">({r.note})</span>}
              </td>
              {isCeo && (
                <td className="px-4 py-3 text-right text-gray-500 tabular-nums text-xs">
                  {contractValue > 0 ? formatVND(contractValue) : '—'}
                </td>
              )}
              {isCeo && (
                <td className="px-4 py-3 text-right text-gray-500 tabular-nums text-xs">
                  {qtValue > 0 ? formatVND(qtValue) : '—'}
                </td>
              )}
              {isCeo && (
                <td className="px-5 py-3 text-right font-medium text-gray-900 tabular-nums">
                  {formatVND(r.amount)}
                </td>
              )}
              <td className="px-5 py-3 text-gray-500">
                {r.collected_date ? new Date(r.collected_date).toLocaleDateString('vi-VN') : '—'}
              </td>
              <td className="px-5 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  r.status === 'collected' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {r.status === 'collected' ? 'Đã thu' : 'Chưa thu'}
                </span>
              </td>
              <td className="px-5 py-3 hidden md:table-cell">
                {r.payment_channel ? (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CHANNEL_STYLE[r.payment_channel] ?? 'bg-gray-100 text-gray-600'}`}>
                    {CHANNEL_LABEL[r.payment_channel] ?? r.payment_channel}
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs">{r.payment_method}</span>
                )}
              </td>
              {isCeo && (
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(r)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => onDelete(r.id, r.stage)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Xóa đợt này"
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
  )
}

export default function RevenueClient({ projects, contracts, revenue, isCeo, userId, cashflow }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [defaultProjectId, setDefaultProjectId] = useState('')
  const [editingEntry, setEditingEntry] = useState<RevenueRow | null>(null)

  const totalCollected = revenue.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
  const totalPending = revenue.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)
  const collected = revenue.filter(r => r.status === 'collected')
  const byChannel = {
    tk_cty: collected.filter(r => r.payment_channel === 'tk_cty').reduce((s, r) => s + r.amount, 0),
    tk_cn:  collected.filter(r => r.payment_channel === 'tk_cn').reduce((s, r) => s + r.amount, 0),
    tm:     collected.filter(r => r.payment_channel === 'tm' || (!r.payment_channel && r.payment_method === 'Tiền mặt')).reduce((s, r) => s + r.amount, 0),
  }

  async function deleteEntry(id: string, stage: string) {
    if (!confirm(`Xóa đợt "${stage}"? Thao tác này không thể hoàn tác.`)) return
    const supabase = createClient()
    await supabase.from('revenue').delete().eq('id', id)
    router.refresh()
  }

  async function deleteAllForProject(projectId: string, projectName: string) {
    if (!confirm(`Xóa TẤT CẢ đợt thu của "${projectName}"?\nThao tác này không thể hoàn tác.`)) return
    const supabase = createClient()
    await supabase.from('revenue').delete().eq('project_id', projectId)
    router.refresh()
  }

  async function deleteAllForContract(contractId: string, label: string) {
    if (!confirm(`Xóa TẤT CẢ đợt thu của "${label}"?\nThao tác này không thể hoàn tác.`)) return
    const supabase = createClient()
    await supabase.from('revenue').delete().eq('contract_id', contractId)
    router.refresh()
  }

  function sortByDate(entries: RevenueRow[]) {
    return [...entries].sort((a, b) => {
      if (!a.collected_date && !b.collected_date) return 0
      if (!a.collected_date) return 1
      if (!b.collected_date) return -1
      return b.collected_date.localeCompare(a.collected_date)
    })
  }

  const grouped = projects
    .map(project => {
      const entries = sortByDate(revenue.filter(r => r.project_id === project.id))
      const projectContracts = contracts.filter(c => c.project_id === project.id)
      const hasMultiple = projectContracts.length > 1

      const collected = entries.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
      const pending = entries.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)

      const contractGroups = hasMultiple
        ? projectContracts.map(contract => {
            const cEntries = sortByDate(entries.filter(r => r.contract_id === contract.id))
            const cQtValue = cEntries
              .filter(r => r.stage.toLowerCase().includes('quyết toán') || r.stage.toLowerCase().includes('quyet toan'))
              .reduce((s, r) => s + r.amount, 0)
            const cCollected = cEntries.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
            const cPending = cEntries.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)
            return { contract, entries: cEntries, qtValue: cQtValue, collected: cCollected, pending: cPending }
          })
        : null

      // Entries with no contract_id (or contract_id not matching any project contract)
      const contractIds = new Set(projectContracts.map(c => c.id))
      const unlinkedEntries = hasMultiple
        ? entries.filter(r => !r.contract_id || !contractIds.has(r.contract_id))
        : []

      const singleContractValue = !hasMultiple ? (projectContracts[0]?.value ?? 0) : 0
      const singleQtValue = !hasMultiple
        ? entries
            .filter(r => r.stage.toLowerCase().includes('quyết toán') || r.stage.toLowerCase().includes('quyet toan'))
            .reduce((s, r) => s + r.amount, 0)
        : 0

      return { project, entries, projectContracts, hasMultiple, contractGroups, unlinkedEntries, singleContractValue, singleQtValue, collected, pending }
    })
    .filter(g => g.entries.length > 0)

  function openModalForProject(projectId: string) {
    setDefaultProjectId(projectId)
    setShowModal(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Doanh thu</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tình hình thu tiền từ khách hàng theo từng công trình</p>
        </div>
        {isCeo && (
          <button
            onClick={() => { setDefaultProjectId(''); setShowModal(true) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shrink-0"
          >
            <Plus size={15} />
            Thêm đợt thu
          </button>
        )}
      </div>

      {isCeo && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-xs text-green-700 font-medium">Đã thu</p>
              <p className="text-xl font-bold text-green-800 mt-1">{formatVNDShort(totalCollected)}</p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
              <p className="text-xs text-orange-700 font-medium">Chưa thu</p>
              <p className="text-xl font-bold text-orange-800 mt-1">{formatVNDShort(totalPending)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs text-blue-600 font-medium mb-1">TK Công ty</p>
              <p className="text-base font-bold text-blue-800 tabular-nums">{formatVNDShort(byChannel.tk_cty)}</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
              <p className="text-xs text-purple-600 font-medium mb-1">TK Cá nhân</p>
              <p className="text-base font-bold text-purple-800 tabular-nums">{formatVNDShort(byChannel.tk_cn)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-xs text-amber-600 font-medium mb-1">Tiền mặt</p>
              <p className="text-base font-bold text-amber-800 tabular-nums">{formatVNDShort(byChannel.tm)}</p>
            </div>
          </div>

          {/* Dòng tiền thực tế */}
          <div className="flex items-center justify-end gap-2"><CashflowHistoryModal /><CashflowAsOfModal /></div>
          <CashflowBox cashflow={cashflow} />
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400 mb-3">Chưa có dữ liệu doanh thu.</p>
          {isCeo && (
            <button
              onClick={() => { setDefaultProjectId(''); setShowModal(true) }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Plus size={15} />
              Thêm đợt thu đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ project, entries, projectContracts, hasMultiple, contractGroups, unlinkedEntries, singleContractValue, singleQtValue, collected, pending }) => (
            <div key={project.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Project header */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-semibold text-gray-900 hover:text-blue-600 flex items-center gap-1 truncate"
                  >
                    {project.name}
                    <ExternalLink size={13} className="text-gray-400 shrink-0" />
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  {isCeo && (
                    <>
                      <span className="text-xs text-green-700 font-medium">Đã thu: {formatVNDShort(collected)}</span>
                      <span className="text-xs text-orange-600 font-medium">Chưa thu: {formatVNDShort(pending)}</span>
                    </>
                  )}
                  {isCeo && (
                    <button
                      onClick={() => openModalForProject(project.id)}
                      className="flex items-center gap-1 px-2.5 py-1 border border-blue-200 text-blue-600 text-xs rounded-lg hover:bg-blue-50"
                    >
                      <Plus size={12} />
                      Thêm đợt
                    </button>
                  )}
                  {isCeo && entries.length > 0 && (
                    <button
                      onClick={() => deleteAllForProject(project.id, project.name)}
                      className="flex items-center gap-1 px-2.5 py-1 border border-red-200 text-red-500 text-xs rounded-lg hover:bg-red-50"
                      title="Xóa tất cả đợt thu của công trình này"
                    >
                      <Trash2 size={12} />
                      Xóa tất cả
                    </button>
                  )}
                </div>
              </div>

              {hasMultiple && contractGroups ? (
                <>
                  {contractGroups.map(({ contract, entries: cEntries, qtValue: cQt, collected: cColl, pending: cPend }) => (
                    <div key={contract.id}>
                      <div className="px-5 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            contract.type === 'vat' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {CONTRACT_LABEL[contract.type] ?? contract.type}
                          </span>
                          {isCeo && (
                            <span className="text-xs text-gray-500">
                              Giá trị HĐ: <span className="font-medium text-gray-700">{formatVND(contract.value)}</span>
                            </span>
                          )}
                          {isCeo && cQt > 0 && (
                            <span className="text-xs text-gray-500">
                              QT: <span className="font-medium text-purple-700">{formatVND(cQt)}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {isCeo && (
                            <>
                              <span className="text-xs text-green-700 font-medium">Đã thu: {formatVNDShort(cColl)}</span>
                              <span className="text-xs text-orange-600 font-medium">Chưa thu: {formatVNDShort(cPend)}</span>
                            </>
                          )}
                          {isCeo && cEntries.length > 0 && (
                            <button
                              onClick={() => deleteAllForContract(contract.id, CONTRACT_LABEL[contract.type] ?? contract.type)}
                              className="flex items-center gap-1 px-2 py-0.5 border border-red-200 text-red-500 text-xs rounded-lg hover:bg-red-50"
                            >
                              <Trash2 size={11} />
                              Xóa HĐ này
                            </button>
                          )}
                        </div>
                      </div>
                      <RevenueTable
                        entries={cEntries}
                        contractValue={contract.value}
                        qtValue={cQt}
                        isCeo={isCeo}
                        onEdit={setEditingEntry}
                        onDelete={deleteEntry}
                      />
                    </div>
                  ))}

                  {/* Unlinked entries (legacy data with no contract_id) */}
                  {unlinkedEntries.length > 0 && (
                    <div>
                      <div className="px-5 py-2 bg-yellow-50 border-b border-yellow-100">
                        <span className="text-xs font-medium text-yellow-700">Chưa phân loại HĐ</span>
                        <span className="ml-2 text-xs text-yellow-600">— vui lòng chỉnh sửa để gắn đúng loại hợp đồng</span>
                      </div>
                      <RevenueTable
                        entries={unlinkedEntries}
                        contractValue={0}
                        qtValue={0}
                        isCeo={isCeo}
                        onEdit={setEditingEntry}
                        onDelete={deleteEntry}
                      />
                    </div>
                  )}
                </>
              ) : (
                <RevenueTable
                  entries={entries}
                  contractValue={singleContractValue}
                  qtValue={singleQtValue}
                  isCeo={isCeo}
                  onEdit={setEditingEntry}
                  onDelete={deleteEntry}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddRevenueEntryModal
          projects={projects}
          contracts={contracts}
          defaultProjectId={defaultProjectId}
          userId={userId}
          onClose={() => setShowModal(false)}
        />
      )}

      {editingEntry && (
        <EditRevenueModal
          entry={editingEntry}
          projects={projects}
          contracts={contracts}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  )
}
