import React from 'react'
import { Employee, PayrollEntry, PayrollResult, calcChuanCong, PROBATION_FACTOR } from './calc'

const fmt = (n: number) =>
  n === 0 ? '—' : n.toLocaleString('vi-VN') + ' đ'

const fmtPos = (n: number) => n.toLocaleString('vi-VN') + ' đ'

interface Props {
  employee: Employee
  entry: Partial<PayrollEntry>
  result: PayrollResult
  month: number
  year: number
  leaveAccrued?: number
  leaveUsed?: number
  leaveRemaining?: number
  advance?: { ck: number; tm: number }   // đã ứng: ck=TK CTY (trừ TN1), tm=TM/TK CN (trừ TN2)
}

const s = {
  sectionTitle: (color: string): React.CSSProperties => ({
    fontSize: 10, fontWeight: 700, color, letterSpacing: 1,
    textTransform: 'uppercase' as const, marginBottom: 7, marginTop: 14,
  }),
  row: (bold = false, muted = false): React.CSSProperties => ({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 0', borderBottom: '1px solid #f1f5f9',
  }),
  label: (bold = false, muted = false): React.CSSProperties => ({
    fontSize: 12, color: muted ? '#94a3b8' : bold ? '#1e293b' : '#475569',
    fontWeight: bold ? 600 : 400,
  }),
  value: (bold = false, color = '#1e293b'): React.CSSProperties => ({
    fontSize: 12, fontWeight: bold ? 700 : 500, color,
    fontVariantNumeric: 'tabular-nums',
  }),
}

const PayslipCard = React.forwardRef<HTMLDivElement, Props>(
  function PayslipCard({ employee, entry, result, month, year, leaveAccrued, leaveUsed, leaveRemaining, advance }, ref) {
    const chuanCong = calcChuanCong(month, year, employee.dept, employee.work_days)
    const adv = advance ?? { ck: 0, tm: 0 }
    const daUng = adv.ck + adv.tm
    const isFullSalary = (employee.salary_type ?? 'proportional') === 'full'
    const isChinhThuc = !result.isProbation
    const actualDays = entry.actual_days ?? 0
    const overtime = entry.overtime_hours ?? 0
    const overtimeLe = entry.overtime_hours_le ?? 0
    const overtimeNote = entry.overtime_note ?? ''
    const pcDiCT = entry.pc_dict ?? 0
    const pcGrab = entry.pc_grab ?? 0
    const kpiBonus = entry.kpi_bonus ?? 0
    const hoaHong = entry.hoa_hong ?? 0
    const hoaHongNote = entry.hoa_hong_note ?? ''
    const pcKhac = entry.pc_khac ?? 0
    const pcKhacNote = entry.pc_khac_note ?? ''
    const ngayNghiPhep = entry.ngay_nghi_phep ?? 0
    const note = entry.note ?? ''
    const genDate = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const Row = ({ label, value, bold = false, valueColor }: {
      label: string; value: number; bold?: boolean; valueColor?: string
    }) => (
      <div style={s.row(bold)}>
        <span style={s.label(bold)}>{label}</span>
        <span style={s.value(bold, valueColor ?? (bold ? '#1e293b' : '#334155'))}>{fmtPos(value)}</span>
      </div>
    )

    return (
      <div ref={ref} style={{
        width: 440,
        background: '#ffffff',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
      }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg, #0f2942 0%, #1e4d8c 100%)', padding: '18px 22px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
              }}>🏗</div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Mitcon Decor &amp; Design
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Phiếu Lương</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Tháng {month}/{year}</div>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.13)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>{employee.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              {[employee.msnv, employee.title, employee.dept].filter(Boolean).join(' · ')}
            </div>
            <div style={{ marginTop: 7, display: 'flex', gap: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', lineHeight: 1,
                fontSize: 10, fontWeight: 600, padding: '4px 9px 5px', borderRadius: 20,
                background: result.isIntern ? 'rgba(167,139,250,0.22)' : isChinhThuc ? 'rgba(74,222,128,0.22)' : 'rgba(251,191,36,0.22)',
                color: result.isIntern ? '#c4b5fd' : isChinhThuc ? '#86efac' : '#fde68a',
              }}>
                {result.isIntern ? 'Thực tập sinh' : isChinhThuc ? 'Chính thức' : 'Thử việc'}
              </span>
              {isFullSalary && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', lineHeight: 1,
                  fontSize: 10, fontWeight: 600, padding: '4px 9px 5px', borderRadius: 20,
                  background: 'rgba(167,139,250,0.22)', color: '#c4b5fd',
                }}>Lương cố định</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '4px 22px 20px' }}>

          {/* Banner thực tập sinh / thử việc */}
          {result.isIntern && (
            <div style={{
              background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 9,
              padding: '8px 12px', marginTop: 12, fontSize: 11, color: '#6d28d9', lineHeight: 1.5,
            }}>
              <strong>Thực tập sinh</strong> — lương {fmtPos(employee.base_salary)}.
              Không trừ BHXH. Toàn bộ chi qua Thực nhận (2).
            </div>
          )}
          {result.isProbation && (
            <div style={{
              background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9,
              padding: '8px 12px', marginTop: 12, fontSize: 11, color: '#c2410c', lineHeight: 1.5,
            }}>
              <strong>Thử việc</strong> — lương = 85% × {fmtPos(employee.base_salary)} ={' '}
              <strong>{fmtPos(Math.round(employee.base_salary * PROBATION_FACTOR))}</strong>.
              Không trừ BHXH. Toàn bộ chi qua Thực nhận (2).
            </div>
          )}

          {/* Ngày công */}
          <p style={s.sectionTitle('#2563eb')}>Ngày công</p>
          {isFullSalary ? (
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 9,
              padding: '9px 13px', fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>
              Lương toàn tháng — {fmtPos(employee.base_salary)}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9,
                padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Công chuẩn</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#475569' }}>{chuanCong}</div>
              </div>
              <div style={{ flex: 1, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 9,
                padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#3b82f6', marginBottom: 2 }}>Ngày công TT</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4ed8' }}>{actualDays}</div>
              </div>
              {overtime > 0 && (
                <div style={{ flex: 1, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9,
                  padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#f97316', marginBottom: 2 }}>Tăng ca</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#ea580c' }}>{overtime}h</div>
                </div>
              )}
              {ngayNghiPhep > 0 && (
                <div style={{ flex: 1, background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 9,
                  padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#d97706', marginBottom: 2 }}>Nghỉ phép</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#b45309' }}>{ngayNghiPhep}</div>
                </div>
              )}
            </div>
          )}

          {/* Phép năm */}
          {leaveAccrued != null && (
            <div style={{ marginTop: 7, fontSize: 10.5, color: '#64748b' }}>
              Phép năm: tích lũy <strong>{leaveAccrued}</strong> · đã nghỉ <strong>{leaveUsed}</strong> · còn lại{' '}
              <strong style={{ color: (leaveRemaining ?? 0) < 0 ? '#dc2626' : '#16a34a' }}>{leaveRemaining}</strong> ngày
            </div>
          )}

          {/* Thu nhập */}
          <p style={s.sectionTitle('#16a34a')}>Thu nhập</p>
          <Row label="TN ngày công" value={result.tnNgayCong} />
          {result.tienTC > 0 && (
            <Row
              label={`Tiền tăng ca${overtime > 0 ? ` · ${overtime}h thường` : ''}${overtimeLe > 0 ? ` · ${overtimeLe}h CN/Lễ` : ''}${overtimeNote ? ` (${overtimeNote})` : ''}`}
              value={result.tienTC}
            />
          )}
          <Row label="TN trước thuế" value={result.tnTruocThue} bold />

          {/* Khấu trừ */}
          <p style={s.sectionTitle('#dc2626')}>Khấu trừ</p>
          <Row label="BHXH NLĐ (10.5%)" value={result.bhxhNLD} />
          <Row label="Thuế TNCN" value={result.thueNCN} />

          {/* Thực nhận 1 */}
          <div style={{
            background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid #86efac',
            borderRadius: 10, padding: '10px 14px', marginTop: 10,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#15803d', letterSpacing: 0.5 }}>✅ THỰC NHẬN (1)</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPos(result.thucNhan1)}
            </div>
          </div>

          {/* Phụ cấp */}
          {result.thucNhan2 > 0 && (
            <>
              <p style={s.sectionTitle('#ea580c')}>Phụ cấp &amp; Thưởng (CKCN)</p>
              {(result.isProbation || result.isIntern) && (result.tnTruocThue - result.bhxhNLD - result.thueNCN) > 0 &&
                <Row label={result.isIntern ? 'Lương thực tập' : 'Lương thử việc'}
                  value={result.tnTruocThue - result.bhxhNLD - result.thueNCN} />}
              {result.pcGiuXe > 0 && <Row label="PC Giữ xe" value={result.pcGiuXe} />}
              {pcDiCT > 0 && <Row label="PC Đi CT" value={pcDiCT} />}
              {pcGrab > 0 && <Row label="PC Grab" value={pcGrab} />}
              {pcKhac > 0 && <Row label={`PC Khác${pcKhacNote ? ` (${pcKhacNote})` : ''}`} value={pcKhac} />}
              {kpiBonus > 0 && <Row label="KPI / Thưởng" value={kpiBonus} />}
              {hoaHong > 0 && <Row label={`KPI CT${hoaHongNote ? ` (${hoaHongNote})` : ''}`} value={hoaHong} />}

              <div style={{
                background: 'linear-gradient(135deg, #fff7ed, #ffedd5)', border: '1.5px solid #fdba74',
                borderRadius: 10, padding: '10px 14px', marginTop: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', letterSpacing: 0.5 }}>THỰC NHẬN (2)</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#c2410c', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPos(result.thucNhan2)}
                </div>
              </div>
            </>
          )}

          {/* Tổng */}
          <div style={{
            background: 'linear-gradient(135deg, #0f2942, #1e4d8c)',
            borderRadius: 12, padding: '13px 16px', marginTop: 10,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>
                TỔNG THỰC NHẬN
              </div>
            </div>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPos(result.tongThucNhan)}
            </div>
          </div>

          {/* Ứng lương trong tháng */}
          {daUng > 0 && (
            <>
              <p style={s.sectionTitle('#16a34a')}>Ứng lương trong tháng</p>
              {adv.ck > 0 && (
                <div style={s.row()}>
                  <span style={s.label()}>Đã ứng (TK Công ty) — trừ Thực nhận (1)</span>
                  <span style={s.value(false, '#16a34a')}>−{fmtPos(adv.ck)}</span>
                </div>
              )}
              {adv.tm > 0 && (
                <div style={s.row()}>
                  <span style={s.label()}>Đã ứng (TM/TK cá nhân) — trừ Thực nhận (2)</span>
                  <span style={s.value(false, '#c2410c')}>−{fmtPos(adv.tm)}</span>
                </div>
              )}
              <div style={{
                background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1.5px solid #a5b4fc',
                borderRadius: 10, padding: '10px 14px', marginTop: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#4338ca', letterSpacing: 0.5 }}>
                  CÒN PHẢI TRẢ
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  color: result.tongThucNhan - daUng < 0 ? '#dc2626' : '#4338ca',
                }}>
                  {(result.tongThucNhan - daUng).toLocaleString('vi-VN')} đ
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 10.5, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                Còn trả CK: <strong style={{ color: result.thucNhan1 - adv.ck < 0 ? '#dc2626' : '#15803d' }}>{(result.thucNhan1 - adv.ck).toLocaleString('vi-VN')} đ</strong>
                {' · '}Còn trả TM: <strong style={{ color: result.thucNhan2 - adv.tm < 0 ? '#dc2626' : '#c2410c' }}>{(result.thucNhan2 - adv.tm).toLocaleString('vi-VN')} đ</strong>
              </div>
            </>
          )}

          {/* Ghi chú */}
          {note && (
            <div style={{
              marginTop: 10, background: '#fefce8', border: '1px solid #fde68a',
              borderRadius: 9, padding: '8px 12px',
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <span style={{ fontSize: 12 }}>📝</span>
              <span style={{ fontSize: 12, color: '#92400e' }}>{note}</span>
            </div>
          )}

          {/* BHXH CTY */}
          {result.bhxhCTY > 0 && (
            <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 9, padding: '7px 12px',
              display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>BHXH Công ty đóng (21.5%)</span>
              <span style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                {fmtPos(result.bhxhCTY)}
              </span>
            </div>
          )}

          {/* Footer */}
          <div style={{
            marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 10, color: '#cbd5e1' }}>Ngày tạo: {genDate}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1' }}>Mitcon Finance System</span>
          </div>
        </div>
      </div>
    )
  }
)

export default PayslipCard
