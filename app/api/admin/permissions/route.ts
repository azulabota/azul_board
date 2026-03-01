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

  if (!userId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const updatePayload: {
    can_use_dev_dashboard?: boolean
    can_use_scheduler?: boolean
  } = {}

  if (typeof body?.can_use_dev_dashboard === 'boolean') {
    updatePayload.can_use_dev_dashboard = body.can_use_dev_dashboard
  }

  if (typeof body?.can_use_scheduler === 'boolean') {
    updatePayload.can_use_scheduler = body.can_use_scheduler
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No permission fields provided' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('user_permissions').update(updatePayload).eq('user_id', userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
