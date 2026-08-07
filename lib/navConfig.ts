import { UserRole } from '@/lib/types'
import { LayoutDashboard, Building2, TrendingUp, FileText, Shield, Users, Banknote, Calculator, FileSignature, UserCog, Sparkles } from 'lucide-react'

// Tách riêng khỏi Navbar.tsx (file 'use client') vì import named export không phải component
// từ 1 file 'use client' vào Server Component gây lỗi runtime production
// ("NAV_ITEMS.filter is not a function") dù typecheck vẫn qua — xem [[project_user_management_page]].
export const ROLE_LABEL: Record<UserRole, string> = {
  ceo: 'CEO',
  ketoan: 'Kế Toán',
  thicong: 'Thi Công',
  thumua: 'Thu Mua',
  nhansu: 'Nhân Sự',
}

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ceo', 'ketoan', 'thicong'] },
  { href: '/projects', label: 'Công trình', icon: Building2, roles: ['ceo', 'ketoan', 'thicong', 'thumua'] },
  { href: '/revenue', label: 'Doanh thu', icon: TrendingUp, roles: ['ceo'] },
  { href: '/invoices', label: 'Kiểm Soát Hóa Đơn', icon: FileText, roles: ['ceo', 'ketoan', 'thicong', 'thumua'] },
  { href: '/payables', label: 'Công nợ', icon: Banknote, roles: ['ceo', 'ketoan'] },
  { href: '/suppliers', label: 'Nhà cung cấp', icon: Users, roles: ['ceo', 'ketoan', 'thicong', 'thumua'] },
  { href: '/payroll', label: 'Bảng lương', icon: Calculator, roles: ['ceo', 'nhansu'] },
  { href: '/hop-dong', label: 'Hợp đồng thầu phụ', icon: FileSignature, roles: ['ceo', 'ketoan', 'nhansu'] },
  { href: '/ceo/opex', label: 'Vận hành', icon: Shield, roles: ['ceo'] },
  { href: '/ceo/co-van-tai-chinh', label: 'Cố vấn tài chính', icon: Sparkles, roles: ['ceo'] },
  { href: '/ceo/users', label: 'Quản lý tài khoản', icon: UserCog, roles: ['ceo'] },
] as const
