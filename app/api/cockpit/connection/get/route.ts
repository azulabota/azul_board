import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearerUser } from '../../../../../lib/server-auth'
import { createSupabaseUserClient } from '../../../../../lib/supabase-admin'

export async function GET(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active' || !auth.canUseDevDashboard) {
    return NextResponse.json({ error: 'Coding Cockpit requires active dev dashboard access' }, { status: 403 })
  }

  const supabase = createSupabaseUserClient(auth.token)
  const { data, error } = await supabase
    .from('user_ai_connections')
    .select('bot_base_url, bot_token_ciphertext, openai_key_ciphertext')
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    bot_base_url: data?.bot_base_url || '',
    has_bot_token: Boolean(data?.bot_token_ciphertext),
    has_openai_key: Boolean(data?.openai_key_ciphertext)
  })
}
