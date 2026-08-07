'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Transaction } from '@/lib/types'
import { formatVND } from '@/lib/utils'
import { X } from 'lucide-react'

interface Props {
  tx: Transaction
  projectId: string
  onClose: () => void
}

export default function EditVatAllocModal({ tx, projectId, onClose }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const [vatAmount, setVatAmount] = useState(String(tx.vat_amount ?? 0))
  const [vatRate, setVatRate] = useState<'vat_8' | 'vat_10'>(tx.vat_rate === 'vat_10' ? 'vat_10' : 'vat_8')
  const [date, setDate] = useState(tx.transaction_date.slice(0, 10))
  const [invoiceNumber, setInvoiceNumber] = useState(tx.invoice_number ?? '')

  const [sourceProjects, setSourceProjects] = useState<{ id: string; name: string }[]>([])
  const [sourceProjectId, setSourceProjectId] = useState(tx.source_project_id ?? '')
  const [sourceCategories, setSourceCategories] = useState<{ id: string; name: string }[]>([])
  const [sourceCategoryId, setSourceCategoryId] = useState(tx.source_category_id ?? '')
  const [loadingSourceCats, setLoadingSourceCats] = useState(false)

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => { if (data) setSourceProjects(data) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nạp hạng mục của công trình gốc — giữ nguyên lựa chọn cũ khi load lần đầu
  useEffect(() => {
    if (!sourceProjectId) { setSourceCategories([]); return }
    setLoadingSourceCats(true)
    supabase.from('categories').select('id, name').eq('project_id', sourceProjectId).order('sort_order')
      .then(({ data }) => {
        setSourceCategories(data ?? [])
        setLoadingSourceCats(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceProjectId])

  function handleSourceProjectChange(id: string) {
    setSourceProjectId(id)
    if (id !== tx.source_project_id) setSourceCategoryId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const vatAmt = parseInt(vatAmount.replace(/[^\d]/g, '') || '0', 10)
    if (vatAmt <= 0) { alert('Số tiền VAT phải lớn hơn 0.'); return }
    if (!sourceProjectId || !sourceCategoryId) { alert('Vui lòng chọn Công trình gốc và Hạng mục gốc.'); return }

    setLoading(true)
    const { error } = await supabase.from('transactions').update({
      vat_amount: vatAmt,
      vat_rate: vatRate,
      transaction_date: date,
      invoice_number: invoiceNumber || null,
      source_project_id: sourceProjectId,
      source_category_id: sourceCategoryId,
    }).eq('id', tx.id)
    setLoading(false)
    if (!error) onClose()
    else alert('Lỗi khi lưu:\n' + error.message)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Sửa khoản Phân bổ VAT</h2>
            <p className="text-xs text-purple-500 mt-0.5">Chỉ ghi nhận VAT khấu trừ — không phải chi phí thật</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền VAT (VND) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="1" required value={vatAmount} onChange={e => setVatAmount(e.target.value)}
                className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              {vatAmount && parseInt(vatAmount) > 0 && (
                <p className="text-xs text-purple-600 mt-0.5 font-medium">{formatVND(parseInt(vatAmount))}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Thuế suất</label>
              <select value={vatRate} onChange={e => setVatRate(e.target.value as 'vat_8' | 'vat_10')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="vat_8">VAT 8%</option>
                <option value="vat_10">VAT 10%</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Công trình gốc <span className="text-red-500">*</span></label>
              <select required value={sourceProjectId} onChange={e => handleSourceProjectChange(e.target.value)}
                className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">-- Chọn công trình --</option>
                {sourceProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.id === projectId ? ' (công trình này)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hạng mục gốc <span className="text-red-500">*</span></label>
              <select required value={sourceCategoryId} onChange={e => setSourceCategoryId(e.target.value)}
                disabled={!sourceProjectId || loadingSourceCats}
                className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:text-gray-400">
                <option value="">{loadingSourceCats ? 'Đang tải...' : '-- Chọn hạng mục --'}</option>
                {sourceCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày phát sinh / Ngày HĐ</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Số hóa đơn</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:bg-purple-300">
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
