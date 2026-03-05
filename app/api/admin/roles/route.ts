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

  // Backwards-compatible payloads:
  // - { userId, action: 'promote'|'demote' } (admin only)
  // New payloads:
  // - { userId, role: 'admin'|'developer', action: 'grant'|'revoke' }
  const legacyAction = body?.action as 'promote' | 'demote' | 'grant' | 'revoke' | undefined
  const requestedRole = (body?.role as 'admin' | 'developer' | undefined) ?? (legacyAction === 'promote' || legacyAction === 'demote' ? 'admin' : undefined)

  if (!userId || !legacyAction) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const action = legacyAction === 'promote' ? 'grant' : legacyAction === 'demote' ? 'revoke' : legacyAction
  const role = requestedRole

  if (!role || !['admin', 'developer'].includes(role) || !['grant', 'revoke'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (action === 'grant') {
    const { error } = await supabaseAdmin.from('user_roles').upsert(
      { user_id: userId, role },
      { onConflict: 'user_id,role', ignoreDuplicates: true }
    )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If granting developer, also grant dev dashboard access for convenience.
    if (role === 'developer') {
      const { error: permErr } = await supabaseAdmin
        .from('user_permissions')
        .update({ can_use_dev_dashboard: true })
        .eq('user_id', userId)

      if (permErr) {
        return NextResponse.json({ error: permErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  }

  // Revoke flow
  if (role === 'admin') {
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
  }

  const { error } = await supabaseAdmin
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If revoking developer, optionally remove dev dashboard access unless they are still an admin.
  if (role === 'developer') {
    const { data: isStillAdmin, error: isStillAdminErr } = await supabaseAdmin.rpc('is_admin', { uid: userId })
    if (isStillAdminErr) {
      return NextResponse.json({ error: isStillAdminErr.message }, { status: 500 })
    }

    if (!isStillAdmin) {
      const { error: permErr } = await supabaseAdmin
        .from('user_permissions')
        .update({ can_use_dev_dashboard: false })
        .eq('user_id', userId)

      if (permErr) {
        return NextResponse.json({ error: permErr.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
