import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'
import { authenticateBearerUser } from '../../../../lib/server-auth'

export async function GET(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active') {
    return NextResponse.json({ error: 'Only active users can access API keys' }, { status: 403 })
  }

  const supabaseAdmin = createSupabaseAdminClient()

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, created_at, last_used_at, revoked_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ keys: data || [] })
}
