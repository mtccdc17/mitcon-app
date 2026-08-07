'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatVND } from '@/lib/utils'
import { ChevronDown, AlertTriangle } from 'lucide-react'

interface InputRow {
  id: string
  project_id: string
  transaction_date: string
  amount: number
  vat_amount?: number | null
  invoice_status: string
  invoice_number?: string | null
  invoice_date?: string | null
  description: string
  supplier?: string | null
  is_vat_allocation?: boolean | null
  projects: { name: string } | null
  categories: { name: string } | null
}

interface OutputRow {
  id: string
  project_id: string
  value: number
  invoice_issue_date: string | null
}

interface Project {
  id: string
  name: string
}

const STATUS_LABEL: Record<string, string> = {
  has_invoice: 'Đã có HĐ',
  waiting: 'Chờ xuất HĐ',
  no_invoice: 'Không có HĐ',
}
const STATUS_COLOR: Record<string, string> = {
  has_invoice: 'bg-green-100 text-green-700',
  waiting: 'bg-yellow-100 text-yellow-700',
  no_invoice: 'bg-gray-100 text-gray-600',
}

type PeriodMode = 'thang' | 'quy' | 'nam'
const pad = (n: number) => String(n).padStart(2, '0')

function periodRange(mode: PeriodMode, month: number, quarter: number, year: number) {
  const fromM = mode === 'thang' ? month : mode === 'quy' ? (quarter - 1) * 3 + 1 : 1
  const toM   = mode === 'thang' ? month : mode === 'quy' ? (quarter - 1) * 3 + 3 : 12
  const fromDate = `${year}-${pad(fromM)}-01`
  const toDate   = `${year}-${pad(toM)}-${pad(new Date(year, toM, 0).getDate())}`
  return { fromDate, toDate }
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN')
}

export default function InvoicesClient({ rows, outputInvoices, projects }: { rows: InputRow[]; outputInvoices: OutputRow[]; projects: Project[] }) {
  const router = useRouter()
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showProjectDrop, setShowProjectDrop] = useState(false)

  const now = new Date()
  const [periodMode, setPeriodMode] = useState<PeriodMode>('quy')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [year, setYear] = useState(now.getFullYear())

  const { fromDate, toDate } = useMemo(
    () => periodRange(periodMode, month, quarter, year),
    [periodMode, month, quarter, year]
  )

  const inputFiltered = useMemo(() => {
    return rows.filter(r => {
      // Hóa đơn phân bổ chéo công trình (is_vat_allocation) là bản sao VAT đã tính 1 lần
      // ở công trình gốc — loại để không cộng trùng vào tổng thuế mua vào toàn công ty.
      if (r.is_vat_allocation) return false
      if (projectFilter && r.project_id !== projectFilter) return false
      if (statusFilter && r.invoice_status !== statusFilter) return false
      const d = (r.invoice_date ?? r.transaction_date).slice(0, 10)
      if (d < fromDate || d > toDate) return false
      return true
    })
  }, [rows, projectFilter, statusFilter, fromDate, toDate])

  const outputByProject = useMemo(() => {
    return outputInvoices.filter(o => !projectFilter || o.project_id === projectFilter)
  }, [outputInvoices, projectFilter])

  const outputInPeriod = useMemo(() => {
    return outputByProject.filter(o => {
      if (!o.invoice_issue_date) return false
      const d = o.invoice_issue_date.slice(0, 10)
      return d >= fromDate && d <= toDate
    })
  }, [outputByProject, fromDate, toDate])

  const outputMissingDate = useMemo(
    () => outputByProject.filter(o => !o.invoice_issue_date),
    [outputByProject]
  )

  const selectedProject = projects.find(p => p.id === projectFilter)
  const projectNameMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.name])),
    [projects]
  )

  const totalWithInvoice = inputFiltered.filter(r => r.invoice_status === 'has_invoice').reduce((s, r) => s + r.amount, 0)
  const totalWaiting = inputFiltered.filter(r => r.invoice_status === 'waiting').reduce((s, r) => s + r.amount, 0)

  // ── Bảng tổng kết dạng tờ khai thuế GTGT (01/GTGT) ──
  const muaVaoVAT = inputFiltered.filter(r => (r.vat_amount ?? 0) > 0)
  const giaTriMuaVao = muaVaoVAT.reduce((s, r) => s + r.amount - (r.vat_amount ?? 0), 0)
  const thueMuaVaoKhauTru = muaVaoVAT.reduce((s, r) => s + (r.vat_amount ?? 0), 0)
  const giaTriBanRa = outputInPeriod.reduce((s, o) => s + Math.round(o.value / 1.08), 0)
  const thueBanRa = outputInPeriod.reduce((s, o) => s + (o.value - Math.round(o.value / 1.08)), 0)
  const thuePhaiNop = thueBanRa - thueMuaVaoKhauTru

  const periodLabel =
    periodMode === 'thang' ? `Tháng ${month}/${year}` :
    periodMode === 'quy' ? `Quý ${quarter}/${year}` :
    `Năm ${year}`

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Kiểm Soát Hóa Đơn</h1>
        <p className="text-sm text-gray-500 mt-0.5">Đối chiếu hóa đơn đầu vào &amp; đầu ra theo công trình, theo kỳ thuế</p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Project filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowProjectDrop(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              projectFilter ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{selectedProject ? selectedProject.name : 'Tất cả công trình'}</span>
            <ChevronDown size={14} />
          </button>
          {showProjectDrop && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowProjectDrop(false)} />
              <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px] max-h-64 overflow-y-auto">
                <button
                  onClick={() => { setProjectFilter(''); setShowProjectDrop(false) }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${!projectFilter ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-gray-700'}`}
                >
                  Tất cả công trình
                </button>
                <div className="border-t border-gray-100" />
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setProjectFilter(p.id); setShowProjectDrop(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${projectFilter === p.id ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-gray-700'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Period mode */}
        <div className="flex items-center gap-1">
          {([['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm']] as [PeriodMode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setPeriodMode(m)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                periodMode === m ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {periodMode === 'thang' && (
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
        )}
        {periodMode === 'quy' && (
          <select
            value={quarter}
            onChange={e => setQuarter(parseInt(e.target.value))}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
          >
            {[1, 2, 3, 4].map(q => (
              <option key={q} value={q}>Quý {q}</option>
            ))}
          </select>
        )}
        <select
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
        >
          {yearOptions.map(y => (
            <option key={y} value={y}>Năm {y}</option>
          ))}
        </select>

        {/* Status filter (input only) */}
        <div className="flex items-center gap-1">
          {[
            { value: '', label: 'Tất cả' },
            { value: 'has_invoice', label: 'Đã có HĐ' },
            { value: 'waiting', label: 'Chờ xuất HĐ' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                statusFilter === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(projectFilter || statusFilter) && (
          <button
            onClick={() => { setProjectFilter(''); setStatusFilter('') }}
            className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      {/* Cảnh báo hóa đơn đầu ra chưa ghi ngày xuất */}
      {outputMissingDate.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-orange-700 font-medium text-sm mb-2">
            <AlertTriangle size={16} />
            {outputMissingDate.length} công trình có HĐ Xuất VAT nhưng CHƯA ghi ngày xuất hóa đơn — không tính được vào bảng tổng kết bên dưới
          </div>
          <div className="flex flex-wrap gap-2">
            {outputMissingDate.map(o => (
              <Link
                key={o.id}
                href={`/projects/${o.project_id}`}
                className="text-xs px-2.5 py-1 bg-white border border-orange-200 rounded-full text-orange-700 hover:bg-orange-100"
              >
                {projectNameMap[o.project_id] ?? '—'} · {formatVND(o.value)}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bảng tổng kết dạng tờ khai GTGT */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-indigo-600 mb-3 uppercase tracking-wide">
          Tổng kết thuế GTGT — {periodLabel} (đối chiếu với tờ khai 01/GTGT đã nộp)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
            <p className="text-xs text-gray-500 mb-1">Giá trị mua vào (chưa VAT)</p>
            <p className="font-bold text-gray-900">{formatVND(giaTriMuaVao)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
            <p className="text-xs text-gray-500 mb-1">Thuế GTGT mua vào (khấu trừ)</p>
            <p className="font-bold text-gray-900">{formatVND(thueMuaVaoKhauTru)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
            <p className="text-xs text-gray-500 mb-1">Giá trị bán ra chịu thuế (chưa VAT)</p>
            <p className="font-bold text-gray-900">{formatVND(giaTriBanRa)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
            <p className="text-xs text-gray-500 mb-1">Thuế GTGT đầu ra</p>
            <p className="font-bold text-gray-900">{formatVND(thueBanRa)}</p>
          </div>
          <div className="bg-indigo-600 rounded-lg px-3 py-2.5">
            <p className="text-xs text-indigo-100 mb-1 font-medium">Thuế GTGT phải nộp</p>
            <p className="font-black text-white text-lg">{formatVND(thuePhaiNop)}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Đối chiếu thủ công với tờ khai 01/GTGT đã nộp — số liệu tính theo dữ liệu trong app (hóa đơn đầu ra chỉ tính khi đã ghi ngày xuất), không thay thế tờ khai chính thức.
        </p>
      </div>

      {/* Summary cards đầu vào */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-700 font-medium">Đã có hóa đơn (đầu vào)</p>
          <p className="text-xl font-bold text-green-800 mt-1">{formatVND(totalWithInvoice)}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
          <p className="text-xs text-yellow-700 font-medium">Chờ xuất hóa đơn (đầu vào)</p>
          <p className="text-xl font-bold text-yellow-800 mt-1">{formatVND(totalWaiting)}</p>
        </div>
      </div>

      {/* Bảng hóa đơn đầu ra */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">Hóa đơn đầu ra — {periodLabel}</h2>
        </div>
        {outputInPeriod.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Không có hóa đơn đầu ra nào trong kỳ này.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Ngày xuất HĐ</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Công trình</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Giá trị HĐ (gồm VAT)</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Chưa VAT</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Thuế GTGT (8%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outputInPeriod.map(o => {
                  const net = Math.round(o.value / 1.08)
                  return (
                    <tr key={o.id} className="hover:bg-blue-50/40 cursor-pointer" onClick={() => router.push(`/projects/${o.project_id}`)}>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(o.invoice_issue_date)}
                      </td>
                      <td className="px-5 py-3 text-gray-900 font-medium">{projectNameMap[o.project_id] ?? '—'}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{formatVND(o.value)}</td>
                      <td className="px-5 py-3 text-right text-gray-600 whitespace-nowrap">{formatVND(net)}</td>
                      <td className="px-5 py-3 text-right text-gray-600 whitespace-nowrap">{formatVND(o.value - net)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bảng hóa đơn đầu vào */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">Hóa đơn đầu vào — {periodLabel}</h2>
        </div>
        {inputFiltered.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Không có khoản nào khớp bộ lọc.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Ngày</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Công trình</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden md:table-cell">Hạng mục</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Nội dung</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Số tiền</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500 hidden lg:table-cell">Thuế GTGT</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Trạng thái HĐ</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden lg:table-cell">Nhà cung cấp</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 hidden lg:table-cell">Số HĐ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inputFiltered.map((r) => (
                  <tr key={r.id} className="hover:bg-blue-50/40 cursor-pointer" onClick={() => router.push(`/projects/${r.project_id}?edit=${r.id}`)}>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(r.transaction_date).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-5 py-3 text-gray-900 font-medium">
                      {r.projects?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden md:table-cell">
                      {r.categories?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-900">{r.description}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {formatVND(r.amount)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600 whitespace-nowrap hidden lg:table-cell">
                      {formatVND(r.vat_amount ?? 0)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.invoice_status]}`}>
                        {STATUS_LABEL[r.invoice_status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 hidden lg:table-cell">{r.supplier ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600 hidden lg:table-cell">{r.invoice_number ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
