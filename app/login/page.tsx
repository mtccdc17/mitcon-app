'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

interface LockData { attempts: number; firstAt: number }

function lockKey(email: string) { return `mitcon_login_lock_${email.toLowerCase().trim()}` }

function getLock(email: string): LockData | null {
  try { const r = localStorage.getItem(lockKey(email)); return r ? JSON.parse(r) : null } catch { return null }
}
function setLock(email: string, d: LockData) {
  try { localStorage.setItem(lockKey(email), JSON.stringify(d)) } catch {}
}
function clearLock(email: string) {
  try { localStorage.removeItem(lockKey(email)) } catch {}
}

function checkLimit(email: string): { blocked: boolean; remaining: number; unlockAt: number | null } {
  const lock = getLock(email)
  if (!lock) return { blocked: false, remaining: MAX_ATTEMPTS, unlockAt: null }
  if (Date.now() - lock.firstAt > WINDOW_MS) {
    clearLock(email)
    return { blocked: false, remaining: MAX_ATTEMPTS, unlockAt: null }
  }
  if (lock.attempts >= MAX_ATTEMPTS) return { blocked: true, remaining: 0, unlockAt: lock.firstAt + WINDOW_MS }
  return { blocked: false, remaining: MAX_ATTEMPTS - lock.attempts, unlockAt: null }
}

function recordFail(email: string) {
  const now = Date.now()
  const lock = getLock(email)
  if (!lock || now - lock.firstAt > WINDOW_MS) setLock(email, { attempts: 1, firstAt: now })
  else setLock(email, { attempts: lock.attempts + 1, firstAt: lock.firstAt })
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    if (!email) return
    const { blocked, unlockAt } = checkLimit(email)
    if (blocked && unlockAt) setCountdown(Math.ceil((unlockAt - Date.now()) / 1000))
    else setCountdown(0)
  }, [email])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const { blocked, unlockAt } = checkLimit(email)
    if (blocked && unlockAt) {
      setCountdown(Math.ceil((unlockAt - Date.now()) / 1000))
      return
    }

    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      recordFail(email)
      const { remaining, unlockAt: ua } = checkLimit(email)
      if (ua) {
        setCountdown(Math.ceil((ua - Date.now()) / 1000))
        setError(`Đăng nhập sai quá ${MAX_ATTEMPTS} lần. Tài khoản bị khóa tạm thời.`)
      } else {
        setError(`Email hoặc mật khẩu không đúng. Còn ${remaining} lần thử.`)
      }
      setLoading(false)
      return
    }

    clearLock(email)
    router.push('/dashboard')
    router.refresh()
  }

  const isLocked = countdown > 0
  const mm = Math.floor(countdown / 60).toString().padStart(2, '0')
  const ss = (countdown % 60).toString().padStart(2, '0')

  return (
    <div className="min-h-full flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-10">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 mb-4">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Mitcon Finance</h1>
            <p className="text-sm text-gray-500 mt-1">Đăng nhập để tiếp tục</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="example@mitcon.vn"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isLocked}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                placeholder="••••••••"
              />
            </div>

            {isLocked ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-3 text-sm text-orange-800">
                <p className="font-medium">Tài khoản bị khóa tạm thời</p>
                <p className="mt-0.5">Thử lại sau <span className="font-mono font-semibold">{mm}:{ss}</span></p>
              </div>
            ) : error ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading || isLocked}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isLocked ? `Khóa ${mm}:${ss}` : loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Mitcon Decor & Design © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
