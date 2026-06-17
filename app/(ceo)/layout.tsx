import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LogOut, LayoutDashboard, DollarSign, Shield } from 'lucide-react'

export default async function CeoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role !== 'ceo') redirect('/dashboard')

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-gray-900 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-amber-500 rounded flex items-center justify-center">
                <Shield size={14} className="text-gray-900" />
              </div>
              <span className="text-white font-medium text-sm">Khu vực CEO</span>
              <span className="text-xs text-gray-500 hidden sm:block">· Chỉ bạn thấy vùng này</span>
            </div>
            <nav className="flex items-center gap-1">
              <CeoNavLink href="/ceo/opex" icon={<DollarSign size={14} />} label="Chi phí vận hành" />
              <CeoNavLink href="/ceo/security" icon={<Shield size={14} />} label="Bảo mật" />
              <Link href="/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                <LayoutDashboard size={14} />
                <span className="hidden md:block">Dashboard</span>
              </Link>
            </nav>
            <div className="text-right">
              <p className="text-xs font-medium text-white">{profile.full_name}</p>
              <p className="text-xs text-amber-400">CEO</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}

function CeoNavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
      {icon}
      <span className="hidden md:block">{label}</span>
    </Link>
  )
}
