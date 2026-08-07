'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { UserRole, Supplier } from '@/lib/types'
import { Plus, Pencil, Trash2, X, Building2, Download, Upload, FileText } from 'lucide-react'
import { exportSuppliers, downloadSuppliersTemplate, parseSuppliersFile } from '@/lib/excel'

interface Props {
  suppliers: Supplier[]
  role: UserRole
  tableReady: boolean
}

export default function SuppliersClient({ suppliers: init, role, tableReady }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; skip: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const canEdit = role === 'ceo' || role === 'ketoan'

  const filtered = init.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.tax_code ?? '').includes(search) ||
    (s.cccd ?? '').includes(search) ||
    (s.phone ?? '').includes(search)
  )

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Xóa "${name}" khỏi danh sách?`)) return
    await supabase.from('suppliers').delete().eq('id', id)
    router.refresh()
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const rows = await parseSuppliersFile(file)
      const valid = rows.filter(r => !r.error && r.name)
      let ok = 0
      for (const r of valid) {
        const { error } = await supabase.from('suppliers').insert({
          name: r.name,
          tax_code: r.tax_code || null,
          cccd: r.cccd || null,
          phone: r.phone || null,
          contact_person: r.contact_person || null,
          note: r.note || null,
        })
        if (!error) ok++
      }
      setImportResult({ ok, skip: rows.length - valid.length })
      router.refresh()
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (!tableReady) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Nhà cung cấp & Nhà thầu</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          <p className="font-semibold mb-2">Cần tạo bảng dữ liệu trước</p>
          <p className="mb-3">Chạy SQL sau trong <strong>Supabase → SQL Editor</strong>:</p>
          <pre className="bg-white border border-amber-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre font-mono">{SQL_MIGRATION}</pre>
          <p className="mt-3 text-xs text-amber-600">Sau khi chạy xong, tải lại trang này.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Nhà cung cấp & Nhà thầu</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Danh bạ đối tác, nhà thầu phụ — dùng để điền nhanh khi nhập khoản chi
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export */}
          <button
            onClick={() => exportSuppliers(init)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download size={14} /> Xuất Excel
          </button>
          {canEdit && (
            <>
              {/* Import template */}
              <button
                onClick={() => downloadSuppliersTemplate()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <FileText size={14} /> Tải mẫu Excel
              </button>
              {/* Import upload */}
              <label className={`flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={14} /> {importing ? 'Đang nhập...' : 'Nhập Excel'}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleImport}
                  disabled={importing}
                />
              </label>
              {/* Add new */}
              <button
                onClick={() => { setEditItem(null); setShowModal(true) }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Plus size={15} /> Thêm mới
              </button>
            </>
          )}
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-800">
          <span>Nhập thành công <strong>{importResult.ok}</strong> nhà cung cấp{importResult.skip > 0 ? `, bỏ qua ${importResult.skip} dòng lỗi` : ''}.</span>
          <button onClick={() => setImportResult(null)} className="text-green-600 hover:text-green-800"><X size={14} /></button>
        </div>
      )}

      {/* Search */}
      <input
        type="search" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Tìm theo tên, MST, CCCD, SĐT..."
        className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Building2 size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">
              {search
                ? 'Không tìm thấy kết quả.'
                : 'Chưa có nhà cung cấp nào. Nhấn "Thêm mới" hoặc "Nhập Excel" để bắt đầu.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Tên công ty / Nhà thầu</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">MST / CCCD</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Số điện thoại</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Người liên hệ</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden lg:table-cell">Ghi chú</th>
                  {canEdit && <th className="px-5 py-3 w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono text-xs">
                      {s.tax_code && <span className="mr-2">MST: {s.tax_code}</span>}
                      {s.cccd && <span>CCCD: {s.cccd}</span>}
                      {!s.tax_code && !s.cccd && '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{s.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-600 hidden md:table-cell">{s.contact_person || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 hidden lg:table-cell max-w-[200px] truncate">{s.note || '—'}</td>
                    {canEdit && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditItem(s); setShowModal(true) }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, s.name)}
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

      <p className="text-xs text-gray-400">{init.length} nhà cung cấp · Xuất Excel để backup, nhập Excel để thêm nhiều cùng lúc.</p>

      {showModal && (
        <SupplierModal
          supplier={editItem}
          onClose={() => { setShowModal(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function SupplierModal({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(supplier?.name ?? '')
  const [taxCode, setTaxCode] = useState(supplier?.tax_code ?? '')
  const [cccd, setCccd] = useState(supplier?.cccd ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [cccdIssueDate, setCccdIssueDate] = useState(supplier?.cccd_issue_date ?? '')
  const [cccdIssuePlace, setCccdIssuePlace] = useState(supplier?.cccd_issue_place ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [contactPerson, setContactPerson] = useState(supplier?.contact_person ?? '')
  const [note, setNote] = useState(supplier?.note ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const data = {
      name,
      tax_code: taxCode || null,
      cccd: cccd || null,
      address: address || null,
      cccd_issue_date: cccdIssueDate || null,
      cccd_issue_place: cccdIssuePlace || null,
      phone: phone || null,
      contact_person: contactPerson || null,
      note: note || null,
    }
    if (supplier) {
      await supabase.from('suppliers').update(data).eq('id', supplier.id)
    } else {
      await supabase.from('suppliers').insert(data)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {supplier ? 'Chỉnh sửa' : 'Thêm'} nhà cung cấp
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Tên công ty / Nhà thầu phụ <span className="text-red-500">*</span>
            </label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="VD: Công ty TNHH ABC, Thợ Nguyễn Văn A..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mã số thuế (MST)</label>
              <input value={taxCode} onChange={e => setTaxCode(e.target.value)} placeholder="0123456789"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CCCD (thợ cá nhân)</label>
              <input value={cccd} onChange={e => setCccd(e.target.value)} placeholder="012345678901"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Địa chỉ thường trú</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Dùng khi soạn hợp đồng thầu phụ"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CCCD ngày cấp</label>
              <input type="date" value={cccdIssueDate} onChange={e => setCccdIssueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CCCD nơi cấp</label>
              <input value={cccdIssuePlace} onChange={e => setCccdIssuePlace(e.target.value)} placeholder="Cục CS QLHC về TTXH"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Số điện thoại</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0901234567"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Người liên hệ</label>
              <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Anh Minh, Chị Lan..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Chuyên thi công sơn, ốp lát..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : supplier ? 'Cập nhật' : 'Thêm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const SQL_MIGRATION = `CREATE TABLE IF NOT EXISTS suppliers (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  tax_code       TEXT,
  cccd           TEXT,
  address        TEXT,
  cccd_issue_date DATE,
  cccd_issue_place TEXT,
  phone          TEXT,
  contact_person TEXT,
  note           TEXT,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON suppliers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON suppliers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update" ON suppliers FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete" ON suppliers FOR DELETE USING (auth.role() = 'authenticated');`
