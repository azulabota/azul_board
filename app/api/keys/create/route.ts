import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'
import { authenticateBearerUser, hashApiKey } from '../../../../lib/server-auth'

export async function POST(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active') {
    return NextResponse.json({ error: 'Only active users can manage API keys' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  const plainKey = `oc_${randomBytes(32).toString('hex')}`
  const keyHash = hashApiKey(plainKey)

  const supabaseAdmin = createSupabaseAdminClient()

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({
      user_id: auth.userId,
      name: name || null,
      key_hash: keyHash
    })
    .select('id, name, created_at, last_used_at, revoked_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ key: plainKey, record: data })
}
