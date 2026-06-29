'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatVND, formatVNDShort } from '@/lib/utils'
import { Plus, ExternalLink, Pencil } from 'lucide-react'
import AddRevenueEntryModal from './AddRevenueEntryModal'
import EditRevenueModal from './EditRevenueModal'

const CONTRACT_LABEL: Record<string, string> = { vat: 'HĐ Xuất VAT', no_vat: 'HĐ Không VAT' }

interface Project { id: string; name: string }
interface ContractRow { id: string; project_id: string; type: string; value: number }
interface RevenueRow {
  id: string
  project_id: string
  contract_id?: string | null
  stage: string
  amount: number
  collected_date?: string | null
  payment_method: string
  status: string
  note?: string | null
}

interface Props {
  projects: Project[]
  contracts: ContractRow[]
  revenue: RevenueRow[]
  isCeo: boolean
  userId: string
}

function RevenueTable({
  entries,
  contractValue,
  qtValue,
  isCeo,
  onEdit,
}: {
  entries: RevenueRow[]
  contractValue: number
  qtValue: number
  isCeo: boolean
  onEdit: (r: RevenueRow) => void
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
            <th className="text-left px-5 py-2.5 font-medium hidden md:table-cell">Hình thức</th>
            {isCeo && <th className="px-3 py-2.5" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {entries.map(r => (
            <tr key={r.id} className="hover:bg-gray-50">
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
              <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{r.payment_method}</td>
              {isCeo && (
                <td className="px-3 py-3">
                  <button
                    onClick={() => onEdit(r)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Pencil size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function RevenueClient({ projects, contracts, revenue, isCeo, userId }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [defaultProjectId, setDefaultProjectId] = useState('')
  const [editingEntry, setEditingEntry] = useState<RevenueRow | null>(null)

  const totalCollected = revenue.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
  const totalPending = revenue.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)

  const grouped = projects
    .map(project => {
      const entries = revenue.filter(r => r.project_id === project.id)
      const projectContracts = contracts.filter(c => c.project_id === project.id)
      const hasMultiple = projectContracts.length > 1

      const collected = entries.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
      const pending = entries.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)

      // Build per-contract sub-groups when project has multiple contracts
      const contractGroups = hasMultiple
        ? projectContracts.map(contract => {
            const cEntries = entries.filter(r => r.contract_id === contract.id)
            const cQtValue = cEntries
              .filter(r => r.stage.toLowerCase().includes('quyết toán') || r.stage.toLowerCase().includes('quyet toan'))
              .reduce((s, r) => s + r.amount, 0)
            const cCollected = cEntries.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
            const cPending = cEntries.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)
            return { contract, entries: cEntries, qtValue: cQtValue, collected: cCollected, pending: cPending }
          })
        : null

      // Single-contract values
      const singleContractValue = !hasMultiple ? (projectContracts[0]?.value ?? 0) : 0
      const singleQtValue = !hasMultiple
        ? entries
            .filter(r => r.stage.toLowerCase().includes('quyết toán') || r.stage.toLowerCase().includes('quyet toan'))
            .reduce((s, r) => s + r.amount, 0)
        : 0

      return { project, entries, projectContracts, hasMultiple, contractGroups, singleContractValue, singleQtValue, collected, pending }
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
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <p className="text-xs text-green-700 font-medium">Đã thu</p>
            <p className="text-xl font-bold text-green-800 mt-1">{formatVNDShort(totalCollected)}</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
            <p className="text-xs text-orange-700 font-medium">Chưa thu</p>
            <p className="text-xl font-bold text-orange-800 mt-1">{formatVNDShort(totalPending)}</p>
          </div>
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
          {grouped.map(({ project, entries, projectContracts, hasMultiple, contractGroups, singleContractValue, singleQtValue, collected, pending }) => (
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
                </div>
              </div>

              {hasMultiple && contractGroups ? (
                // Multiple contracts: show sub-sections per contract
                contractGroups.map(({ contract, entries: cEntries, qtValue: cQt, collected: cColl, pending: cPend }) => (
                  <div key={contract.id}>
                    <div className="px-5 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          contract.type === 'vat'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-200 text-gray-600'
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
                      {isCeo && (
                        <div className="flex gap-3 text-xs">
                          <span className="text-green-700 font-medium">Đã thu: {formatVNDShort(cColl)}</span>
                          <span className="text-orange-600 font-medium">Chưa thu: {formatVNDShort(cPend)}</span>
                        </div>
                      )}
                    </div>
                    <RevenueTable
                      entries={cEntries}
                      contractValue={contract.value}
                      qtValue={cQt}
                      isCeo={isCeo}
                      onEdit={setEditingEntry}
                    />
                  </div>
                ))
              ) : (
                // Single contract: flat view
                <RevenueTable
                  entries={entries}
                  contractValue={singleContractValue}
                  qtValue={singleQtValue}
                  isCeo={isCeo}
                  onEdit={setEditingEntry}
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
