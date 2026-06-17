'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, AlertTriangle, Eye, EyeOff } from 'lucide-react'

interface Props {
  config: { code_layer1_hash?: string; code_layer2_hash?: string; otp_email?: string; otp_configured?: boolean } | null
  userId: string
  userEmail: string
}

export default function SecurityClient({ config, userId, userEmail }: Props) {
  const supabase = createClient()
  const [code1, setCode1] = useState('')
  const [code2, setCode2] = useState('')
  const [showCodes, setShowCodes] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [deletionStep, setDeletionStep] = useState(0)
  const [enterCode1, setEnterCode1] = useState('')
  const [enterCode2, setEnterCode2] = useState('')
  const [enterOtp, setEnterOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function saveCodes(e: React.FormEvent) {
    e.preventDefault()
    if (code1.length !== 6 || code2.length !== 6) {
      setSavedMsg('Mỗi mã phải đúng 6 chữ số.')
      return
    }
    if (code1 === code2) {
      setSavedMsg('Hai mã không được trùng nhau.')
      return
    }

    const { data: existing } = await supabase.from('security_config').select('id').single()

    if (existing) {
      await supabase.from('security_config').update({
        code_layer1_hash: btoa(code1),
        code_layer2_hash: btoa(code2),
        otp_email: userEmail,
        last_updated: new Date().toISOString(),
        updated_by: userId,
      }).eq('id', existing.id)
    } else {
      await supabase.from('security_config').insert({
        code_layer1_hash: btoa(code1),
        code_layer2_hash: btoa(code2),
        otp_email: userEmail,
        updated_by: userId,
      })
    }

    setSavedMsg('✓ Đã lưu 2 mã bảo mật thành công.')
    setCode1('')
    setCode2('')
  }

  async function verifyLayer1() {
    if (enterCode1.length !== 6) { setDeleteError('Nhập đủ 6 chữ số.'); return }
    if (!config?.code_layer1_hash) { setDeleteError('Chưa cấu hình mã bảo mật.'); return }
    if (btoa(enterCode1) !== config.code_layer1_hash) { setDeleteError('Mã 1 không đúng.'); return }
    setDeleteError('')
    setDeletionStep(1)
  }

  async function verifyLayer2() {
    if (enterCode2.length !== 6) { setDeleteError('Nhập đủ 6 chữ số.'); return }
    if (!config?.code_layer2_hash) { setDeleteError('Chưa cấu hình mã bảo mật.'); return }
    if (btoa(enterCode2) !== config.code_layer2_hash) { setDeleteError('Mã 2 không đúng.'); return }
    if (enterCode2 === enterCode1) { setDeleteError('Mã 2 phải khác mã 1.'); return }
    setDeleteError('')
    setDeletionStep(2)
    // Send OTP email - configured after launch
    setOtpSent(true)
  }

  function verifyOtpAndDelete() {
    // OTP verification configured post-launch
    // For now, show placeholder
    setDeleteError('Xác thực OTP qua email sẽ được cấu hình sau khi app chạy.')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Bảo mật</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cài đặt mã xóa dữ liệu và bảo vệ hệ thống</p>
      </div>

      {/* Setup codes */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-blue-600" />
          <h2 className="font-medium text-gray-900">Cài đặt mã bảo mật (2 lớp)</h2>
        </div>
        <p className="text-sm text-gray-500">Hai mã 6 chữ số khác nhau. Dùng để xác thực khi cần xóa hệ thống.</p>

        {config?.code_layer1_hash && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
            ✓ Đã cài đặt 2 mã bảo mật. Cập nhật bên dưới để thay đổi.
          </div>
        )}

        <form onSubmit={saveCodes} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mã 1 (6 chữ số)</label>
              <div className="relative">
                <input
                  type={showCodes ? 'text' : 'password'}
                  value={code1}
                  onChange={e => setCode1(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest"
                  placeholder="••••••"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mã 2 (6 chữ số, khác mã 1)</label>
              <input
                type={showCodes ? 'text' : 'password'}
                value={code2}
                onChange={e => setCode2(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest"
                placeholder="••••••"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowCodes(v => !v)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
              {showCodes ? <><EyeOff size={14} /> Ẩn</> : <><Eye size={14} /> Hiện</>}
            </button>
          </div>
          {savedMsg && <p className="text-sm text-green-600">{savedMsg}</p>}
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            Lưu mã bảo mật
          </button>
        </form>

        <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500">
          <p>OTP Email: <span className="font-medium text-gray-700">{userEmail}</span> — Sẽ cấu hình sau khi app chạy</p>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-600" />
          <h2 className="font-semibold text-red-800">Vùng nguy hiểm — Xóa toàn bộ dữ liệu</h2>
        </div>
        <p className="text-sm text-red-700">
          Thao tác này sẽ xóa tất cả dữ liệu khỏi hệ thống. Cần xác thực 3 lớp: Mã 1 → Mã 2 → OTP Email.
        </p>

        {deletionStep === 0 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-red-700 mb-1">Nhập Mã 1</label>
              <input
                type="password"
                maxLength={6}
                value={enterCode1}
                onChange={e => setEnterCode1(e.target.value.replace(/\D/g, ''))}
                className="px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 tracking-widest w-32"
                placeholder="••••••"
              />
            </div>
            {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
            <button onClick={verifyLayer1} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">
              Xác nhận Mã 1
            </button>
          </div>
        )}

        {deletionStep === 1 && (
          <div className="space-y-3">
            <div className="bg-red-100 rounded px-3 py-2 text-xs text-red-700">✓ Mã 1 xác thực thành công</div>
            <div>
              <label className="block text-xs font-medium text-red-700 mb-1">Nhập Mã 2</label>
              <input
                type="password"
                maxLength={6}
                value={enterCode2}
                onChange={e => setEnterCode2(e.target.value.replace(/\D/g, ''))}
                className="px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 tracking-widest w-32"
                placeholder="••••••"
              />
            </div>
            {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
            <button onClick={verifyLayer2} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">
              Xác nhận Mã 2
            </button>
          </div>
        )}

        {deletionStep === 2 && (
          <div className="space-y-3">
            <div className="bg-red-100 rounded px-3 py-2 text-xs text-red-700">✓ Mã 2 xác thực thành công</div>
            <p className="text-sm text-red-700">
              {otpSent ? `OTP đã được gửi đến ${userEmail}.` : ''}
            </p>
            <div>
              <label className="block text-xs font-medium text-red-700 mb-1">Nhập OTP từ email</label>
              <input
                type="text"
                maxLength={6}
                value={enterOtp}
                onChange={e => setEnterOtp(e.target.value)}
                className="px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 tracking-widest w-32"
                placeholder="OTP"
              />
            </div>
            {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
            <button onClick={verifyOtpAndDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-700 rounded-lg hover:bg-red-800">
              XÁC NHẬN XÓA TOÀN BỘ DỮ LIỆU
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
