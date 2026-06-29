'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatVND, formatVNDShort } from '@/lib/utils'
import { Plus, ExternalLink } from 'lucide-react'
import AddRevenueEntryModal from './AddRevenueEntryModal'

interface Project { id: string; name: string }
interface ContractRow { id: string; project_id: string; value: number }
interface RevenueRow {
  id: string
  project_id: string
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

export default function RevenueClient({ projects, contracts, revenue, isCeo, userId }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [defaultProjectId, setDefaultProjectId] = useState('')

  const totalCollected = revenue.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
  const totalPending = revenue.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)

  const grouped = projects
    .map(project => {
      const entries = revenue.filter(r => r.project_id === project.id)
      const contractValue = contracts
        .filter(c => c.project_id === project.id)
        .reduce((s, c) => s + c.value, 0)
      const collected = entries.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0)
      const pending = entries.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)
      return { project, entries, contractValue, collected, pending }
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
          {grouped.map(({ project, entries, contractValue, collected, pending }) => (
            <div key={project.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-semibold text-gray-900 hover:text-blue-600 flex items-center gap-1 truncate"
                  >
                    {project.name}
                    <ExternalLink size={13} className="text-gray-400 shrink-0" />
                  </Link>
                  {isCeo && contractValue > 0 && (
                    <span className="text-xs text-gray-500 shrink-0">
                      HĐ đã ký: <span className="font-medium text-gray-700">{formatVND(contractValue)}</span>
                    </span>
                  )}
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

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100 bg-white">
                      <th className="text-left px-5 py-2.5 font-medium">Đợt thu</th>
                      {isCeo && <th className="text-right px-5 py-2.5 font-medium">Số tiền</th>}
                      <th className="text-left px-5 py-2.5 font-medium">Ngày thu</th>
                      <th className="text-left px-5 py-2.5 font-medium">Trạng thái</th>
                      <th className="text-left px-5 py-2.5 font-medium hidden md:table-cell">Hình thức</th>
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
                          <td className="px-5 py-3 text-right font-medium text-gray-900 tabular-nums">
                            {formatVND(r.amount)}
                          </td>
                        )}
                        <td className="px-5 py-3 text-gray-500">
                          {r.collected_date
                            ? new Date(r.collected_date).toLocaleDateString('vi-VN')
                            : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.status === 'collected'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {r.status === 'collected' ? 'Đã thu' : 'Chưa thu'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{r.payment_method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddRevenueEntryModal
          projects={projects}
          defaultProjectId={defaultProjectId}
          userId={userId}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
