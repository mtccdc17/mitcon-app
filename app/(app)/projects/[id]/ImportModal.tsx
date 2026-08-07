'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseImportFile, downloadImportTemplate, ParsedTransactionRow } from '@/lib/excel'
import { Category, Contract } from '@/lib/types'
import { formatVND, calcVAT, calcTNCN } from '@/lib/utils'
import { X, Upload, Download, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Props {
  projectId: string
  contracts: Contract[]
  categories: Category[]
  userId: string
  projectName: string
  onClose: () => void
}

export default function ImportModal({ projectId, contracts, categories, userId, projectName, onClose }: Props) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedTransactionRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [parseError, setParseError] = useState('')

  const validRows = rows.filter(r => !r.error)
  const errorRows = rows.filter(r => r.error)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError('')
    try {
      const parsed = await parseImportFile(file)
      setRows(parsed)
    } catch {
      setParseError('Không đọc được file. Vui lòng dùng đúng file mẫu .xlsx.')
    }
  }

  async function handleImport() {
    setImporting(true)
    const vatContract = contracts.find(c => c.type === 'vat')
    const noVatContract = contracts.find(c => c.type === 'no_vat')

    // Resolve / auto-create categories
    const catCache = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    for (const row of validRows) {
      const key = row.categoryName.toLowerCase()
      if (!catCache.has(key)) {
        const { data } = await supabase.from('categories').insert({
          project_id: projectId, name: row.categoryName,
        }).select().single()
        if (data) catCache.set(key, data.id)
      }
    }

    const inserts = validRows.map(row => {
      const contractId = row.contractType === 'vat' ? vatContract?.id : noVatContract?.id
      const vat_amount = row.isLabor ? 0 : calcVAT(row.amount, row.vatRate)
      const tncn_amount = row.isLabor ? calcTNCN(row.amount) : 0
      return {
        project_id: projectId,
        contract_id: contractId,
        category_id: catCache.get(row.categoryName.toLowerCase()),
        transaction_date: row.date,
        unit: 'Nhập từ Excel',
        description: row.description,
        amount: row.amount,
        vat_rate: row.isLabor ? 'no_vat' : row.vatRate,
        vat_amount,
        tncn_amount,
        // amount đã gồm VAT → khi trả đủ, tiền thật ra = amount (không trừ VAT)
        actual_paid: row.paymentStatus === 'paid' ? row.amount : 0,
        is_labor: row.isLabor,
        labor_contract_status: row.isLabor ? row.laborContractStatus : 'not_signed',
        invoice_status: row.isLabor ? 'no_invoice' : row.invoiceStatus,
        invoice_number: row.invoiceNumber || null,
        supplier: row.supplier || null,
        payment_status: row.paymentStatus,
        payment_date: row.paymentDate || null,
        created_by: userId,
      }
    })

    await supabase.from('transactions').insert(inserts)
    setImporting(false)
    setDone(true)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Nhập dữ liệu từ Excel</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {done ? (
            <div className="text-center py-10">
              <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
              <p className="font-medium text-gray-900">Đã nhập thành công {validRows.length} khoản chi!</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                Đóng
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => downloadImportTemplate(projectName)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download size={14} /> Tải file mẫu (.xlsx)
              </button>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300"
              >
                <Upload size={28} className="text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">{fileName || 'Bấm để chọn file Excel đã điền'}</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </div>

              {parseError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{parseError}</p>}

              {rows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-green-700 font-medium">{validRows.length} dòng hợp lệ</span>
                    {errorRows.length > 0 && (
                      <span className="text-red-600 font-medium flex items-center gap-1">
                        <AlertTriangle size={14} /> {errorRows.length} dòng lỗi
                      </span>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Dòng</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Ngày</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Hạng mục</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Nội dung</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Số tiền</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map(r => (
                          <tr key={r.rowIndex} className={r.error ? 'bg-red-50' : ''}>
                            <td className="px-3 py-2 text-gray-500">{r.rowIndex}</td>
                            <td className="px-3 py-2">{r.date}</td>
                            <td className="px-3 py-2">{r.categoryName}</td>
                            <td className="px-3 py-2 max-w-[160px] truncate">{r.description}</td>
                            <td className="px-3 py-2 text-right">{formatVND(r.amount)}</td>
                            <td className="px-3 py-2">
                              {r.error ? <span className="text-red-600">{r.error}</span> : <span className="text-green-600">OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
                <button
                  onClick={handleImport}
                  disabled={importing || validRows.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {importing ? 'Đang nhập...' : `Nhập ${validRows.length} khoản chi`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
