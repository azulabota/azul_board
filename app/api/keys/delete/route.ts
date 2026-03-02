import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'
import { authenticateBearerUser } from '../../../../lib/server-auth'

export async function POST(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active') {
    return NextResponse.json({ error: 'Only active users can delete API keys' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const keyId = Number(body?.id)
  const force = Boolean(body?.force)

  if (!Number.isFinite(keyId) || keyId <= 0) {
    return NextResponse.json({ error: 'Invalid key id' }, { status: 400 })
  }

  const supabaseAdmin = createSupabaseAdminClient()

  // Safety: require revoke first unless force=true
  if (!force) {
    const { data: keyRow, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('id, revoked_at')
      .eq('id', keyId)
      .eq('user_id', auth.userId)
      .maybeSingle()

    if (keyError) {
      return NextResponse.json({ error: keyError.message }, { status: 500 })
    }

    if (!keyRow) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    if (!keyRow.revoked_at) {
      return NextResponse.json({ error: 'Revoke this key before deleting it (or pass force=true)' }, { status: 400 })
    }
  }

  const { error } = await supabaseAdmin.from('api_keys').delete().eq('id', keyId).eq('user_id', auth.userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
