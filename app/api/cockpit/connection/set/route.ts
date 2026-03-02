import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearerUser } from '../../../../../lib/server-auth'
import { createSupabaseUserClient } from '../../../../../lib/supabase-admin'
import { encryptSecret } from '../../../../../lib/encryption'

type ConnectionBody = {
  bot_base_url?: string
  bot_token?: string
  openai_key?: string
}

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)

export async function POST(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active' || !auth.canUseDevDashboard) {
    return NextResponse.json({ error: 'Coding Cockpit requires active dev dashboard access' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as ConnectionBody
  const supabase = createSupabaseUserClient(auth.token)

  const { data: existing, error: existingError } = await supabase
    .from('user_ai_connections')
    .select('*')
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const payload: Record<string, string | null> = {
    user_id: auth.userId,
    bot_base_url: existing?.bot_base_url || null,
    bot_token_ciphertext: existing?.bot_token_ciphertext || null,
    bot_token_iv: existing?.bot_token_iv || null,
    bot_token_tag: existing?.bot_token_tag || null,
    openai_key_ciphertext: existing?.openai_key_ciphertext || null,
    openai_key_iv: existing?.openai_key_iv || null,
    openai_key_tag: existing?.openai_key_tag || null
  }

  if (hasOwn(body, 'bot_base_url')) {
    const normalized = (body.bot_base_url || '').trim().replace(/\/+$/, '')
    payload.bot_base_url = normalized || null
  }

  if (hasOwn(body, 'bot_token')) {
    const rawToken = (body.bot_token || '').trim()
    if (rawToken) {
      const encrypted = encryptSecret(rawToken)
      payload.bot_token_ciphertext = encrypted.ciphertext
      payload.bot_token_iv = encrypted.iv
      payload.bot_token_tag = encrypted.tag
    } else {
      payload.bot_token_ciphertext = null
      payload.bot_token_iv = null
      payload.bot_token_tag = null
    }
  }

  if (hasOwn(body, 'openai_key')) {
    const rawOpenAiKey = (body.openai_key || '').trim()
    if (rawOpenAiKey) {
      const encrypted = encryptSecret(rawOpenAiKey)
      payload.openai_key_ciphertext = encrypted.ciphertext
      payload.openai_key_iv = encrypted.iv
      payload.openai_key_tag = encrypted.tag
    } else {
      payload.openai_key_ciphertext = null
      payload.openai_key_iv = null
      payload.openai_key_tag = null
    }
  }

  const { error } = await supabase.from('user_ai_connections').upsert(payload, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
