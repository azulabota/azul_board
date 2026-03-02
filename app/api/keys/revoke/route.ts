import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'
import { authenticateBearerUser } from '../../../../lib/server-auth'

export async function POST(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active') {
    return NextResponse.json({ error: 'Only active users can revoke API keys' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const keyId = Number(body?.id)

  if (!Number.isFinite(keyId) || keyId <= 0) {
    return NextResponse.json({ error: 'Invalid key id' }, { status: 400 })
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const revokedAt = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .update({ revoked_at: revokedAt })
    .eq('id', keyId)
    .eq('user_id', auth.userId)
    .is('revoked_at', null)
    .select('id, name, created_at, last_used_at, revoked_at')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'API key not found or already revoked' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ key: data })
}
