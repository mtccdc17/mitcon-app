import { createClient } from '@/lib/supabase/server'
import { getUser, getProfile } from '@/lib/supabase/cached'
import { NextRequest, NextResponse } from 'next/server'

// CEO chốt 2026-08-05: mục Ứng lương CHỈ ceo + nhansu được ghi (không ketoan, không thumua).
const CAN_WRITE = ['ceo', 'nhansu']

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfile(user.id)
  if (!profile || !CAN_WRITE.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const {
    staff_id,
    advance_amount,
    advance_month,
    advance_year,
    is_probation,
    source_channel,
    notes,
  } = await req.json()

  if (!staff_id || !advance_amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()

  const row: Record<string, unknown> = {
    staff_id,
    advance_amount,
    advance_month,
    advance_year,
    is_probation,
    source_channel: source_channel || 'tm',
    notes: notes || null,
    created_by: user.id,
  }

  let { data, error } = await supabase.from('payroll_advances').insert(row).select()

  // Cột source_channel chưa được ALTER trên DB → thử lại không có nó
  if (error && /source_channel/.test(error.message)) {
    delete row.source_channel
    ;({ data, error } = await supabase.from('payroll_advances').insert(row).select())
  }

  if (error) {
    return NextResponse.json({ error: `${error.message}${error.code ? ` [${error.code}]` : ''}` }, { status: 400 })
  }

  return NextResponse.json(data)
}
