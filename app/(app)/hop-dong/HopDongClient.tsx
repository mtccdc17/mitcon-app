'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { UserRole, Project, Category, Supplier, Transaction, ContractDocument } from '@/lib/types'
import { buildContractGroups, ContractGroup, formatDateVN, MaterialInvoiceRef } from '@/lib/hopDong'
import { generateContractDocx, contractFileName } from '@/lib/docxContract'
import { formatVND } from '@/lib/utils'
import { soTienBangChu } from '@/lib/soTienBangChu'
import { FileSignature, Download, AlertTriangle, CheckCircle2, FolderOpen, X, History, ExternalLink } from 'lucide-react'

interface Props {
  laborTransactions: Transaction[]
  materialTransactions: MaterialInvoiceRef[]
  projects: Project[]
  categories: Category[]
  suppliers: Supplier[]
  contractDocs: ContractDocument[]
  role: UserRole
  tableReady: boolean
}

export default function HopDongClient({
  laborTransactions, materialTransactions, projects, categories, suppliers, contractDocs,
  role, tableReady,
}: Props) {
  const supabase = createClient()
  const canEdit = role === 'ceo' || role === 'ketoan' || role === 'nhansu'
  const [filter, setFilter] = useState<'can_soan' | 'da_soan' | 'all'>('can_soan')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [preview, setPreview] = useState<ContractGroup | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const { groups, unassigned } = useMemo(
    () => buildContractGroups(laborTransactions, materialTransactions, projects, categories, suppliers, contractDocs),
    [laborTransactions, materialTransactions, projects, categories, suppliers, contractDocs]
  )

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) map.set(g.project.id, g.project.name)
    for (const u of unassigned) map.set(u.project.id, u.project.name)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [groups, unassigned])

  // "Cần soạn" = chưa từng tạo file .docx qua công cụ này — không dựa vào cờ "Có hợp đồng" trên giao dịch
  // (cờ đó do kế toán bật tay để tính TNCN, không đồng nghĩa đã có file hợp đồng thật).
  // "Đã soạn" = ngược lại — xem lại/tải lại các hợp đồng đã tạo qua công cụ này.
  const byStatus =
    filter === 'can_soan' ? groups.filter(g => !g.alreadyDrafted) :
    filter === 'da_soan'  ? groups.filter(g => g.alreadyDrafted) :
    groups
  const visible = projectFilter === 'all' ? byStatus : byStatus.filter(g => g.project.id === projectFilter)
  const visibleUnassigned = projectFilter === 'all' ? unassigned : unassigned.filter(u => u.project.id === projectFilter)

  // Nhóm theo công trình → bên trong là các hạng mục/thợ (groups đã sort theo project.name rồi category.name).
  const byProject: { project: Project; items: ContractGroup[] }[] = []
  for (const g of visible) {
    const last = byProject[byProject.length - 1]
    if (last && last.project.id === g.project.id) last.items.push(g)
    else byProject.push({ project: g.project, items: [g] })
  }

  if (!tableReady) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Hợp đồng thầu phụ</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          <p className="font-semibold mb-2">Cần chạy migration trước — làm đúng thứ tự 2 bước</p>
          <p className="mb-1"><strong>Bước 1</strong> (bấm Run riêng, đợi chạy xong hẳn mới sang bước 2 — vì Postgres không cho dùng giá trị enum mới thêm trong cùng lượt chạy với bước sau):</p>
          <pre className="bg-white border border-amber-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre font-mono">{SQL_MIGRATION_STEP1}</pre>
          <p className="mt-3 mb-1"><strong>Bước 2</strong> (chạy sau khi Bước 1 đã thành công):</p>
          <pre className="bg-white border border-amber-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre font-mono">{SQL_MIGRATION}</pre>
          <p className="mt-3 text-xs text-amber-600">Sau khi chạy xong cả 2 bước, tải lại trang này.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hợp đồng thầu phụ</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Soạn Hợp đồng giao khoán nhân công cho các thợ/nhà thầu nhận chi phí chuyển khoản có TNCN.
          </p>
        </div>
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <History size={14} /> Lịch sử đã soạn ({contractDocs.length})
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FilterTab active={filter === 'can_soan'} onClick={() => setFilter('can_soan')}>Cần soạn</FilterTab>
          <FilterTab active={filter === 'da_soan'} onClick={() => setFilter('da_soan')}>Đã soạn</FilterTab>
          <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>Tất cả</FilterTab>
        </div>
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Tất cả công trình</option>
          {projectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {visibleUnassigned.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          <p className="font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle size={15} /> {visibleUnassigned.length} nhóm khoản chi nhân công chuyển khoản chưa gom được — thiếu Hạng mục hoặc Tên thợ
          </p>
          <ul className="space-y-2">
            {visibleUnassigned.map(u => (
              <li key={u.key} className="bg-white/60 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <strong>{u.project.name}</strong>
                    {u.supplierName ? <> — {u.supplierName}</> : <> — (chưa nhập tên thợ)</>}
                    {' · '}{u.transactionCount} khoản, tổng {formatVND(u.totalAmount)}
                    {' · '}{u.reason === 'no_category' ? 'thiếu Hạng mục' : 'thiếu Tên thợ/nhà thầu'}
                  </span>
                  <Link
                    href={`/projects/${u.project.id}`}
                    className="flex items-center gap-1 text-red-700 hover:underline shrink-0 text-xs font-medium"
                  >
                    Mở Công trình <ExternalLink size={12} />
                  </Link>
                </div>
                <ul className="mt-1.5 space-y-1 border-t border-red-100 pt-1.5">
                  {u.transactions.map(t => (
                    <li key={t.id} className="flex items-center justify-between gap-3 text-xs text-red-700/90 pl-2">
                      <span>
                        {formatDateVN(t.transaction_date)} — {t.description || '(không có nội dung)'} — {formatVND(t.amount)}
                      </span>
                      <Link
                        href={`/projects/${u.project.id}?edit=${t.id}`}
                        className="flex items-center gap-1 text-red-700 hover:underline shrink-0 font-medium"
                      >
                        Sửa khoản này <ExternalLink size={11} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-red-600">
            Bấm &quot;Sửa khoản này&quot; để mở đúng khoản chi đó trong Công trình, gán đúng Hạng mục (và Tên thợ nếu thiếu) — sau đó khoản chi này sẽ tự hiện ra ở danh sách dưới.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {byProject.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center">
            <FileSignature size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">
              {filter === 'can_soan' ? 'Không có thợ/nhà thầu nào cần soạn hợp đồng.'
                : filter === 'da_soan' ? 'Chưa có hợp đồng nào được soạn qua công cụ này.'
                : 'Chưa có khoản chi nhân công chuyển khoản nào.'}
            </p>
          </div>
        ) : (
          byProject.map(({ project, items }) => (
            <div key={project.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{project.name}</h3>
                <span className="text-xs text-gray-500">{items.length} hạng mục/thợ</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">Hạng mục</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">Thợ / Nhà thầu</th>
                      <th className="text-right px-5 py-2.5 font-medium text-gray-500">Tổng tiền</th>
                      <th className="text-center px-5 py-2.5 font-medium text-gray-500">Số đợt</th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">Trạng thái</th>
                      <th className="px-5 py-2.5 w-32" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map(g => (
                      <tr key={g.key} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-600">{g.category.name}</td>
                        <td className="px-5 py-3 font-medium text-gray-900">{g.supplierName}</td>
                        <td className="px-5 py-3 text-right text-gray-900 font-mono">{formatVND(g.totalAmount)}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{g.installmentCount}</td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {g.missing.length === 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
                                <CheckCircle2 size={12} /> Sẵn sàng
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full" title={g.missing.join('\n')}>
                                <AlertTriangle size={12} /> Thiếu {g.missing.length} mục
                              </span>
                            )}
                            {g.alreadyDrafted && (
                              <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
                                Đã soạn {formatDateVN(g.lastDraftedAt)}
                              </span>
                            )}
                            {!g.alreadyDrafted && !g.hasUnsignedTx && (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded-full"
                                title='Giao dịch đã đánh dấu "Có hợp đồng" trong sổ (để tính TNCN) nhưng chưa có file .docx tạo qua công cụ này.'
                              >
                                Có HĐ trong sổ, chưa có file
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {canEdit && (
                            <button
                              onClick={() => setPreview(g)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                            >
                              <FileSignature size={13} /> Soạn hợp đồng
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-gray-400">
        Chỉ gom các khoản chi nhân công thanh toán bằng <strong>chuyển khoản</strong> (Nội dung TT bắt đầu bằng &quot;CK&quot;).
        Ngày ký lấy theo hóa đơn vật tư VAT đầu tiên của hạng mục; hạng mục không có vật tư (thuần nhân công) thì lấy ngày chuyển khoản nhân công đầu tiên trừ 10 ngày. Ngày hoàn thành ưu tiên khoản chi ghi &quot;đợt cuối&quot;, nếu không có thì lấy Ngày kết thúc công trình trừ 10 ngày (Thạch cao) hoặc 2 ngày (hạng mục khác).
      </p>

      {preview && (
        <PreviewModal group={preview} supabase={supabase} onClose={() => setPreview(null)} />
      )}

      {showHistory && (
        <HistoryModal docs={contractDocs} onClose={() => setShowHistory(false)} />
      )}
    </div>
  )
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

function PreviewModal({
  group, supabase, onClose,
}: {
  group: ContractGroup
  supabase: ReturnType<typeof createClient>
  onClose: () => void
}) {
  const [downloading, setDownloading] = useState(false)
  const [done, setDone] = useState(false)
  const blocked = group.missing.length > 0

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await generateContractDocx(group)
      const fileName = contractFileName(group)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      await supabase.from('contract_documents').insert({
        project_id: group.project.id,
        category_id: group.category.id,
        supplier_id: group.supplier?.id ?? null,
        contract_number: group.contractNumber,
        total_amount: group.totalAmount,
        installment_count: group.installmentCount,
        signed_date: group.signedDate,
        completion_date: group.completionDate,
        transaction_ids: group.transactions.map(t => t.id),
        file_name: fileName,
      })
      setDone(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Soạn hợp đồng — {group.supplierName}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-3 text-sm">
          {blocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
              <p className="font-medium mb-1 flex items-center gap-1.5"><AlertTriangle size={14} /> Chưa đủ dữ liệu để soạn</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {group.missing.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          <Row label="Số hợp đồng" value={group.contractNumber ?? '—'} />
          <Row label="Công trình" value={`${group.project.name}${group.project.address ? ' — ' + group.project.address : ''}`} />
          <Row label="Hạng mục" value={group.category.name} />
          <Row label="Bên B" value={group.supplierName} />
          <Row label="CCCD" value={group.supplier?.cccd || '(chưa có)'} />
          <Row label="Địa chỉ Bên B" value={group.supplier?.address || '(chưa có)'} />
          <Row label="Ngày ký" value={
            (formatDateVN(group.signedDate) || '—') +
            (group.signedDateSource === 'fallback' ? ' (không có vật tư — lấy ngày chuyển khoản NC đầu tiên trừ 10 ngày)' : ' (theo hóa đơn vật tư)')
          } />
          <Row label="Ngày hoàn thành" value={
            (formatDateVN(group.completionDate) || '—') +
            (group.completionDateSource === 'note' ? ' (theo khoản chi ghi "đợt cuối")' : group.completionDateSource === 'formula' ? ' (tính từ ngày kết thúc công trình)' : '')
          } />
          <Row label="Thời hạn" value={group.durationDays !== null ? `${group.durationDays} ngày` : '—'} />
          <Row label="Giá trị hợp đồng" value={`${formatVND(group.totalAmount)} (${soTienBangChu(group.totalAmount)})`} />
          <Row label="Số đợt thanh toán" value={String(group.installmentCount)} />
          <div>
            <p className="text-gray-500 mb-1">Nội dung từng đợt</p>
            <ul className="list-disc pl-5 text-gray-800 space-y-0.5">
              {group.installmentClauses.map((c, i) => <li key={i}>Đợt {i + 1}: {c}</li>)}
            </ul>
          </div>

          {group.project.documents_folder_url && (
            <a
              href={group.project.documents_folder_url}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-blue-600 hover:underline text-xs"
            >
              <FolderOpen size={13} /> Mở thư mục lưu trữ công trình
            </a>
          )}

          {done && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-xs">
              Đã tải file <strong>{contractFileName(group)}</strong>. Sếp lưu vào thư mục Drive của công trình để quản lý/in.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Đóng</button>
          <button
            onClick={handleDownload}
            disabled={blocked || downloading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
          >
            <Download size={14} /> {downloading ? 'Đang tạo...' : 'Tải hợp đồng (.docx)'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  )
}

function HistoryModal({ docs, onClose }: { docs: ContractDocument[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Lịch sử hợp đồng đã soạn</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4">
          {docs.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Chưa soạn hợp đồng nào.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="text-left py-2 font-medium text-gray-500">Số HĐ</th>
                  <th className="text-left py-2 font-medium text-gray-500">Tên file</th>
                  <th className="text-right py-2 font-medium text-gray-500">Giá trị</th>
                  <th className="text-left py-2 font-medium text-gray-500">Tạo lúc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map(d => (
                  <tr key={d.id}>
                    <td className="py-2 font-mono text-xs">{d.contract_number}</td>
                    <td className="py-2 text-gray-700">{d.file_name}</td>
                    <td className="py-2 text-right font-mono">{formatVND(d.total_amount)}</td>
                    <td className="py-2 text-gray-500 text-xs">{new Date(d.created_at).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// PostgreSQL không cho dùng giá trị enum mới thêm trong cùng transaction/script đã ADD VALUE nó —
// phải chạy khối này riêng (Run) trước, rồi mới chạy SQL_MIGRATION bên dưới.
const SQL_MIGRATION_STEP1 = `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'nhansu';`

const SQL_MIGRATION = `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cccd_issue_date DATE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cccd_issue_place TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS documents_folder_url TEXT;

CREATE TABLE IF NOT EXISTS contract_documents (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  category_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id       UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  contract_number   TEXT NOT NULL,
  total_amount      BIGINT NOT NULL DEFAULT 0,
  installment_count INT NOT NULL DEFAULT 1,
  signed_date       DATE NOT NULL,
  completion_date   DATE NOT NULL,
  transaction_ids   UUID[] NOT NULL,
  file_name         TEXT NOT NULL,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contract_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON contract_documents FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "write_ceo_ketoan_nhansu" ON contract_documents FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo','ketoan','nhansu')));
CREATE POLICY "delete_ceo_ketoan" ON contract_documents FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ceo','ketoan')));
CREATE INDEX IF NOT EXISTS idx_contract_documents_project ON contract_documents(project_id);`
