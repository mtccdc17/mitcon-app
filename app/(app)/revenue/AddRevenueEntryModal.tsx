'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Plus, ChevronDown } from 'lucide-react'

const STAGE_PRESETS = ['Tạm ứng 1', 'Tạm ứng 2', 'Tạm ứng 3', 'Quyết toán', 'Thu phụ']
const CONTRACT_LABEL: Record<string, string> = { vat: 'HĐ Xuất VAT', no_vat: 'HĐ Không VAT' }

interface Project { id: string; name: string }
interface ContractRow { id: string; project_id: string; type: string; value: number }

interface Props {
  projects: Project[]
  contracts: ContractRow[]
  defaultProjectId?: string
  userId: string
  onClose: () => void
}

export default function AddRevenueEntryModal({ projects: initialProjects, contracts: initialContracts, defaultProjectId, userId, onClose }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? '')
  const [projects, setProjects] = useState(initialProjects)
  const [contracts, setContracts] = useState(initialContracts)

  // Mini form state
  const [showNewProject, setShowNewProject] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCustomer, setNewCustomer] = useState('')
  const [newPhase, setNewPhase] = useState<'Thi Công' | 'Thiết Kế'>('Thi Công')
  const [creatingProject, setCreatingProject] = useState(false)

  async function handleCreateProject() {
    if (!newName.trim() || !newCustomer.trim()) return
    setCreatingProject(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: project, error } = await supabase.from('projects').insert({
      name: newName.trim().toUpperCase(),
      customer_name: newCustomer.trim().toUpperCase(),
      phase: newPhase,
      created_by: user?.id,
    }).select().single()

    if (error || !project) {
      alert('Không thể tạo công trình. Thử lại.')
      setCreatingProject(false)
      return
    }

    // Create 2 default contracts
    const { data: newContracts } = await supabase.from('contracts').insert([
      { project_id: project.id, type: 'vat', value: 0, description: 'Hợp đồng xuất hóa đơn VAT' },
      { project_id: project.id, type: 'no_vat', value: 0, description: 'Hợp đồng không xuất hóa đơn' },
    ]).select()

    setProjects(prev => [...prev, { id: project.id, name: project.name }])
    if (newContracts) setContracts(prev => [...prev, ...newContracts])
    setSelectedProjectId(project.id)
    setShowNewProject(false)
    setNewName('')
    setNewCustomer('')
    setNewPhase('Thi Công')
    setCreatingProject(false)
  }

  const projectContracts = contracts.filter(c => c.project_id === selectedProjectId)
  const hasMultipleContracts = projectContracts.length > 1

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)

    const contractId = form.get('contract_id') as string || null
    const autoContractId = projectContracts.length === 1 ? projectContracts[0].id : contractId

    const channel = form.get('payment_channel') as string || 'tk_cty'
    const { error } = await supabase.from('revenue').insert({
      project_id: selectedProjectId,
      contract_id: autoContractId || null,
      stage: form.get('stage') as string,
      amount: parseInt(form.get('amount') as string || '0', 10),
      collected_date: form.get('collected_date') as string || null,
      payment_method: channel === 'tm' ? 'Tiền mặt' : 'Chuyển khoản',
      payment_channel: channel,
      status: form.get('status') as string || 'pending',
      note: form.get('note') as string || null,
      created_by: userId,
    })

    if (!error) {
      router.refresh()
      onClose()
    } else {
      alert('Lỗi khi lưu. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Thêm đợt thu tiền</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Công trình <span className="text-red-500">*</span></label>
            <select
              name="project_id"
              required
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Chọn công trình --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* Nút mở mini-form tạo công trình mới */}
            {!showNewProject ? (
              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Plus size={13} /> Tạo công trình mới
              </button>
            ) : (
              <div className="mt-3 border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Công trình mới</p>
                  <button type="button" onClick={() => setShowNewProject(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tên công trình <span className="text-red-500">*</span></label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="VD: VP Công ty ABC - Q1"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tên khách hàng <span className="text-red-500">*</span></label>
                  <input
                    value={newCustomer}
                    onChange={e => setNewCustomer(e.target.value)}
                    placeholder="VD: Công ty TNHH ABC"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Giai đoạn</label>
                  <div className="flex gap-2">
                    {(['Thi Công', 'Thiết Kế'] as const).map(ph => (
                      <button
                        key={ph}
                        type="button"
                        onClick={() => setNewPhase(ph)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          newPhase === ph
                            ? ph === 'Thi Công'
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-purple-500 bg-purple-600 text-white'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {ph === 'Thi Công' ? '🏗' : '✏️'} {ph}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={creatingProject || !newName.trim() || !newCustomer.trim()}
                  className="w-full py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
                >
                  {creatingProject ? 'Đang tạo...' : '✓ Tạo & chọn công trình này'}
                </button>
              </div>
            )}
          </div>

          {hasMultipleContracts && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Loại hợp đồng <span className="text-red-500">*</span></label>
              <select
                name="contract_id"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn loại HĐ --</option>
                {projectContracts.map(c => (
                  <option key={c.id} value={c.id}>
                    {CONTRACT_LABEL[c.type] ?? c.type} — {c.value.toLocaleString('vi-VN')}₫
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedProjectId && !hasMultipleContracts && projectContracts.length === 1 && (
            <p className="text-xs text-gray-400 -mt-1">
              Tự động gắn: <span className="font-medium text-gray-600">{CONTRACT_LABEL[projectContracts[0].type] ?? projectContracts[0].type}</span>
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Đợt thu <span className="text-red-500">*</span></label>
            <input
              name="stage"
              required
              value={stage}
              onChange={e => setStage(e.target.value)}
              placeholder="VD: Tạm ứng 1, Quyết toán..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {STAGE_PRESETS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    stage === s
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND) <span className="text-red-500">*</span></label>
            <input
              name="amount"
              type="number"
              required
              min="0"
              step="1"
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày thu</label>
              <input
                name="collected_date"
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái</label>
              <select
                name="status"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Chưa thu</option>
                <option value="collected">Đã thu</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kênh thu tiền <span className="text-red-500">*</span></label>
            <select
              name="payment_channel"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="tk_cty">TK Công ty</option>
              <option value="tk_cn">TK Cá nhân</option>
              <option value="tm">Tiền mặt</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
            <input
              name="note"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
