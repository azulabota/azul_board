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
  const action = body?.action as 'promote' | 'demote' | undefined

  if (!userId || !action || !['promote', 'demote'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (action === 'promote') {
    const { error } = await supabaseAdmin.from('user_roles').upsert(
      { user_id: userId, role: 'admin' },
      { onConflict: 'user_id,role', ignoreDuplicates: true }
    )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  const { count, error: countError } = await supabaseAdmin
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  if ((count || 0) <= 1) {
    return NextResponse.json({ error: 'Cannot remove the last admin' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', 'admin')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
