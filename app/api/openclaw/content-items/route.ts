import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'
import { authenticateApiKey } from '../../../../lib/server-auth'

type ContentItemPayload = {
  date?: string
  title?: string
  type?: string
  content?: string | null
  platform?: string
  status?: string
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active') {
    return NextResponse.json({ error: 'User is not active' }, { status: 403 })
  }

  if (!auth.canUseScheduler) {
    return NextResponse.json({ error: 'Scheduler access is required' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as ContentItemPayload | null

  if (!body?.date || !body?.title || !body?.type) {
    return NextResponse.json({ error: 'Missing required fields: date, title, type' }, { status: 400 })
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const payload = {
    user_id: auth.userId,
    date: body.date,
    title: body.title.trim(),
    type: body.type.trim(),
    content: typeof body.content === 'string' ? body.content : null,
    platform: body.platform?.trim() || 'X',
    status: body.status?.trim() || 'scheduled'
  }

  const { data, error } = await supabaseAdmin
    .from('content_items')
    .insert(payload)
    .select('id, user_id, date, title, type, content, platform, status, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
