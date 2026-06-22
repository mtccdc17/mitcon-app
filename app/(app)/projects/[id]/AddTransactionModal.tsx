'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Category, UserRole } from '@/lib/types'
import { calcVAT, calcTNCN, formatVND } from '@/lib/utils'
import { X, Plus } from 'lucide-react'

interface Props {
  projectId: string
  contractId: string
  categories: Category[]
  userId: string
  userName: string
  role: UserRole
  defaultCategoryId?: string
  onClose: () => void
}

type TxMode = 'material' | 'labor' | 'combined' | 'vat_alloc'

const UNIT_OPTIONS: Record<UserRole, string> = {
  ceo: 'CEO',
  ketoan: 'Kế Toán',
  thicong: 'Thi Công',
  thumua: 'Thu Mua',
}

export default function AddTransactionModal({
  projectId, contractId, categories, userId, userName, role, defaultCategoryId, onClose
}: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<TxMode>('material')

  // Shared fields — controlled state (preserves across mode switches)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? '')
  const [description, setDescription] = useState('')
  const [supplier, setSupplier] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [paymentDate, setPaymentDate] = useState('')
  const [partialAmount, setPartialAmount] = useState('')

  // Material fields — preserved when switching to labor
  const [amountMaterial, setAmountMaterial] = useState('')
  const [vatRate, setVatRate] = useState<'vat_10' | 'vat_8' | 'no_vat'>('no_vat')
  const [invoiceStatus, setInvoiceStatus] = useState('no_invoice')
  const [invoiceNumber, setInvoiceNumber] = useState('')

  // Labor fields — preserved when switching to material
  const [amountLabor, setAmountLabor] = useState('')
  const [laborContractStatus, setLaborContractStatus] = useState('not_signed')
  const [note, setNote] = useState('')

  // VAT allocation fields
  const [vatAllocAmount, setVatAllocAmount] = useState('')
  const [vatAllocRate, setVatAllocRate] = useState<'vat_8' | 'vat_10'>('vat_8')
  const [vatAllocRef, setVatAllocRef] = useState('')

  // Supplier autocomplete
  const [supplierList, setSupplierList] = useState<{ id: string; name: string; tax_code?: string; phone?: string }[]>([])
  const [showSupplierDrop, setShowSupplierDrop] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierTaxCode, setNewSupplierTaxCode] = useState('')
  const [newSupplierCccd, setNewSupplierCccd] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [newSupplierContact, setNewSupplierContact] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)

  useEffect(() => {
    supabase.from('suppliers').select('id, name, tax_code, phone').order('name')
      .then(({ data }) => { if (data) setSupplierList(data) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredSuppliers = supplierList.filter(s =>
    !supplier || s.name.toLowerCase().includes(supplier.toLowerCase())
  )

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return
    setAddingSupplier(true)
    const { data } = await supabase.from('suppliers')
      .insert({
        name: newSupplierName.trim(),
        tax_code: newSupplierTaxCode.trim() || null,
        cccd: newSupplierCccd.trim() || null,
        phone: newSupplierPhone.trim() || null,
        contact_person: newSupplierContact.trim() || null,
        created_by: userId,
      })
      .select('id, name, tax_code, phone')
      .single()
    if (data) {
      setSupplierList(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSupplier(data.name)
      setShowAddSupplier(false)
      setNewSupplierName(''); setNewSupplierTaxCode(''); setNewSupplierCccd('')
      setNewSupplierPhone(''); setNewSupplierContact('')
    }
    setAddingSupplier(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const partialPaid = parseInt(partialAmount.replace(/[^\d]/g, '') || '0', 10)

    const initHistory = (paymentStatus === 'partial' && partialPaid > 0)
      ? [{ amount: partialPaid, date: paymentDate || date, method: note || '' }]
      : []

    const shared = {
      project_id: projectId,
      contract_id: contractId || null,
      category_id: categoryId || null,
      transaction_date: date,
      unit: UNIT_OPTIONS[role],
      description,
      supplier: supplier || null,
      note: note || null,
      payment_status: paymentStatus,
      payment_date: paymentDate || null,
      next_payment_date: null,
      payment_history: initHistory.length > 0 ? initHistory : null,
      created_by: userId,
    }

    const records: object[] = []

    if (mode === 'material' || mode === 'combined') {
      const amount = parseInt(amountMaterial.replace(/[^\d]/g, '') || '0', 10)
      if (amount > 0) {
        const vat_amount = calcVAT(amount, vatRate)
        const actualPaidMaterial =
          paymentStatus === 'paid' ? amount :
          paymentStatus === 'partial' ? partialPaid :
          0
        records.push({
          ...shared,
          amount,
          vat_rate: vatRate,
          vat_amount,
          tncn_amount: 0,
          actual_paid: actualPaidMaterial,
          is_labor: false,
          labor_contract_status: 'not_signed',
          invoice_status: invoiceStatus,
          invoice_number: invoiceNumber || null,
        })
      }
    }

    if (mode === 'labor' || mode === 'combined') {
      const amount = parseInt(amountLabor.replace(/[^\d]/g, '') || '0', 10)
      if (amount > 0) {
        const tncn_amount = calcTNCN(amount)
        const actualPaidLabor =
          paymentStatus === 'paid' ? amount :
          paymentStatus === 'partial' ? partialPaid :
          0
        records.push({
          ...shared,
          amount,
          vat_rate: 'no_vat',
          vat_amount: 0,
          tncn_amount,
          actual_paid: actualPaidLabor,
          is_labor: true,
          labor_contract_status: laborContractStatus,
          invoice_status: 'no_invoice',
          invoice_number: null,
        })
      }
    }

    if (mode === 'vat_alloc') {
      const vatAmt = parseInt(vatAllocAmount.replace(/[^\d]/g, '') || '0', 10)
      if (vatAmt > 0) {
        records.push({
          ...shared,
          amount: 0,
          vat_rate: vatAllocRate,
          vat_amount: vatAmt,
          tncn_amount: 0,
          actual_paid: 0,
          is_labor: false,
          is_vat_allocation: true,
          labor_contract_status: 'not_signed',
          invoice_status: 'has_invoice',
          invoice_number: invoiceNumber || null,
          note: vatAllocRef || null,
        })
      }
    }

    if (records.length === 0) {
      alert('Vui lòng nhập ít nhất một khoản tiền.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('transactions').insert(records)
    if (!error) onClose()
    else { alert('Lỗi khi lưu. Vui lòng thử lại.'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Thêm khoản chi</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button type="button" onClick={() => setMode('material')}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'material' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Vật tư
            </button>
            <button type="button" onClick={() => setMode('labor')}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'labor' ? 'bg-pink-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Nhân công
            </button>
            <button type="button" onClick={() => setMode('combined')}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'combined' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Gộp VT+NC
            </button>
            <button type="button" onClick={() => setMode('vat_alloc')}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'vat_alloc' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Phân bổ VAT
            </button>
          </div>

          {/* Date + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ngày phát sinh / Ngày HĐ <span className="text-red-500">*</span></label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hạng mục</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Không có --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nội dung <span className="text-red-500">*</span></label>
            <input required value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Mô tả khoản chi..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Supplier autocomplete — always visible */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Nhà cung cấp / Nhà thầu</label>
              <button type="button"
                onClick={() => { setShowAddSupplier(v => !v); setShowSupplierDrop(false) }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                <Plus size={12} /> Thêm mới
              </button>
            </div>
            <input
              value={supplier}
              onChange={e => { setSupplier(e.target.value); setShowSupplierDrop(true); setShowAddSupplier(false) }}
              onFocus={() => { setShowSupplierDrop(true); setShowAddSupplier(false) }}
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
            {showAddSupplier && (
              <div className="mt-2 border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-700">Thêm nhà cung cấp mới</p>
                <input
                  autoFocus
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  placeholder="Tên nhà cung cấp / nhà thầu *"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newSupplierTaxCode}
                    onChange={e => setNewSupplierTaxCode(e.target.value)}
                    placeholder="Mã số thuế (MST)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={newSupplierCccd}
                    onChange={e => setNewSupplierCccd(e.target.value)}
                    placeholder="CCCD / CMND"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={newSupplierPhone}
                    onChange={e => setNewSupplierPhone(e.target.value)}
                    placeholder="Số điện thoại"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={newSupplierContact}
                    onChange={e => setNewSupplierContact(e.target.value)}
                    placeholder="Người liên hệ"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => {
                    setShowAddSupplier(false)
                    setNewSupplierName(''); setNewSupplierTaxCode(''); setNewSupplierCccd('')
                    setNewSupplierPhone(''); setNewSupplierContact('')
                  }}
                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50">Hủy</button>
                  <button type="button" onClick={handleAddSupplier}
                    disabled={!newSupplierName.trim() || addingSupplier}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                    {addingSupplier ? 'Đang lưu...' : 'Lưu & chọn'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hình thức TT</label>
            <select value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Chưa chọn --</option>
              <option value="Tiền mặt">Tiền mặt</option>
              <option value="CK công ty">CK công ty</option>
              <option value="CK cá nhân">CK cá nhân</option>
            </select>
          </div>

          {/* VAT Allocation form */}
          {mode === 'vat_alloc' && (
            <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-purple-700">Phân bổ VAT đầu vào từ công trình khác</p>
              <p className="text-xs text-purple-500">Chỉ ghi nhận số VAT để khấu trừ — không tính vào chi phí / lợi nhuận công trình này.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền VAT (VND) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="1" value={vatAllocAmount} onChange={e => setVatAllocAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="0" />
                  {vatAllocAmount && parseInt(vatAllocAmount) > 0 && (
                    <p className="text-xs text-purple-600 mt-0.5 font-medium">{formatVND(parseInt(vatAllocAmount))}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Thuế suất</label>
                  <select value={vatAllocRate} onChange={e => setVatAllocRate(e.target.value as 'vat_8' | 'vat_10')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="vat_8">VAT 8%</option>
                    <option value="vat_10">VAT 10%</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Công trình gốc (ghi chú)</label>
                <input value={vatAllocRef} onChange={e => setVatAllocRef(e.target.value)}
                  placeholder="VD: CT A - HĐ ván gỗ công nghiệp"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số hóa đơn</label>
                <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>
          )}

          {/* Amounts */}
          {mode !== 'vat_alloc' && (mode === 'combined' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">Tiền vật tư (VND)</label>
                <input type="number" min="0" step="1" value={amountMaterial} onChange={e => setAmountMaterial(e.target.value)}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                {amountMaterial && parseInt(amountMaterial) > 0 && (
                  <p className="text-xs text-blue-600 mt-0.5 font-medium">{formatVND(parseInt(amountMaterial))}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-pink-700 mb-1">Tiền nhân công (VND)</label>
                <input type="number" min="0" step="1" value={amountLabor} onChange={e => setAmountLabor(e.target.value)}
                  className="w-full px-3 py-2 border border-pink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" placeholder="0" />
                {amountLabor && parseInt(amountLabor) > 0 && (
                  <p className="text-xs text-pink-600 mt-0.5 font-medium">{formatVND(parseInt(amountLabor))}</p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND) <span className="text-red-500">*</span></label>
              {mode === 'material'
                ? <>
                    <input type="number" required min="0" step="1" value={amountMaterial} onChange={e => setAmountMaterial(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    {amountMaterial && parseInt(amountMaterial) > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5 font-medium">{formatVND(parseInt(amountMaterial))}</p>
                    )}
                  </>
                : <>
                    <input type="number" required min="0" step="1" value={amountLabor} onChange={e => setAmountLabor(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    {amountLabor && parseInt(amountLabor) > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5 font-medium">{formatVND(parseInt(amountLabor))}</p>
                    )}
                  </>
              }
            </div>
          ))}

          {/* Material section */}
          {(mode === 'material' || mode === 'combined') && (
            <div className={mode === 'combined' ? 'border border-blue-100 bg-blue-50/40 rounded-lg p-3 space-y-3' : 'space-y-3'}>
              {mode === 'combined' && <p className="text-xs font-semibold text-blue-700">Thông tin phần vật tư</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Loại VAT</label>
                  <select value={vatRate} onChange={e => setVatRate(e.target.value as typeof vatRate)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="no_vat">Không VAT</option>
                    <option value="vat_10">VAT 10%</option>
                    <option value="vat_8">VAT 8%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tình trạng hóa đơn</label>
                  <select value={invoiceStatus} onChange={e => setInvoiceStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="no_invoice">Không có hóa đơn</option>
                    <option value="waiting">Chờ xuất hóa đơn</option>
                    <option value="has_invoice">Đã có hóa đơn</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số hóa đơn</label>
                <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {/* Labor section */}
          {(mode === 'labor' || mode === 'combined') && (
            <div className={mode === 'combined' ? 'border border-pink-100 bg-pink-50/40 rounded-lg p-3' : ''}>
              {mode === 'combined' && <p className="text-xs font-semibold text-pink-700 mb-2">Thông tin phần nhân công</p>}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tình trạng hợp đồng nhân công</label>
                <select value={laborContractStatus} onChange={e => setLaborContractStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="not_signed">Chưa làm hợp đồng</option>
                  <option value="signed">Đã làm hợp đồng</option>
                </select>
              </div>
            </div>
          )}

          {/* Payment — không hiển thị cho Phân bổ VAT */}
          {mode !== 'vat_alloc' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tình trạng thanh toán</label>
                  <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="pending">Chưa thanh toán</option>
                    <option value="partial">Thanh toán một phần</option>
                    <option value="paid">Đã thanh toán</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {paymentStatus === 'partial' ? 'Ngày TT đợt này' : 'Ngày thanh toán'}
                  </label>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {paymentStatus === 'partial' && (
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-orange-700 mb-2">Đợt thanh toán đầu tiên</p>
                  <div>
                    <label className="block text-xs font-medium text-orange-700 mb-1">Số tiền đã TT *</label>
                    <input
                      type="number" min="0" step="1"
                      value={partialAmount}
                      onChange={e => setPartialAmount(e.target.value)}
                      placeholder="VD: 50000000"
                      className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                    />
                    {partialAmount && parseInt(partialAmount) > 0 && (
                      <p className="text-xs text-orange-600 mt-0.5 font-medium">{formatVND(parseInt(partialAmount))}</p>
                    )}
                  </div>
                  <p className="text-xs text-orange-500 mt-2">Dùng "Ngày TT đợt này" ở trên. Vào chỉnh sửa để ghi nhận đợt 2.</p>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Hủy</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Đang lưu...' : mode === 'combined' ? 'Lưu (VT + NC)' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
