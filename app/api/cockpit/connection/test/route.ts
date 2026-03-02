import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearerUser } from '../../../../../lib/server-auth'
import { createSupabaseUserClient } from '../../../../../lib/supabase-admin'
import { decryptSecret } from '../../../../../lib/encryption'

export async function POST(request: NextRequest) {
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
    .select('bot_base_url, bot_token_ciphertext, bot_token_iv, bot_token_tag')
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const botBaseUrl = (data?.bot_base_url || '').trim().replace(/\/+$/, '')
  const botToken = decryptSecret({
    ciphertext: data?.bot_token_ciphertext || '',
    iv: data?.bot_token_iv || '',
    tag: data?.bot_token_tag || ''
  })

  if (!botBaseUrl || !botToken) {
    return NextResponse.json({ ok: false, error: 'Missing bot_base_url or bot token' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(`${botBaseUrl}/cockpit/health`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${botToken}`
      },
      signal: controller.signal
    })

    const body = await res.json().catch(() => null)

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: body?.error || `Health check failed (${res.status})` },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, details: body || { status: 'ok' } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed to reach bot' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
