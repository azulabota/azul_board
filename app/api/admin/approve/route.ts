import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/admin-auth'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)
  if ('error' in adminCheck) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
  }

  const supabaseAdmin = createSupabaseAdminClient()

  const body = await request.json().catch(() => null)
  const userId = body?.userId as string | undefined
  const status = body?.status as 'pending' | 'active' | 'disabled' | undefined

  if (!userId || !status || !['pending', 'active', 'disabled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('profiles').update({ status }).eq('id', userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (status === 'disabled') {
    const { error: permissionError } = await supabaseAdmin
      .from('user_permissions')
      .update({ can_use_dev_dashboard: false, can_use_scheduler: false })
      .eq('user_id', userId)

    if (permissionError) {
      return NextResponse.json({ error: permissionError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
