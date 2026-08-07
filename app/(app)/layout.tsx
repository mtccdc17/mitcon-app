import { redirect } from 'next/navigation'
import { getUser, getProfile } from '@/lib/supabase/cached'
import Navbar from '@/components/Navbar'
import { UserRole } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  // app_metadata.role is authoritative for 'nhansu' (not yet in DB enum)
  const effectiveRole = ((user.app_metadata as Record<string, string>)?.role ?? profile.role) as UserRole

  return (
    <div className="min-h-full flex flex-col">
      <Navbar role={effectiveRole} name={profile.full_name} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
