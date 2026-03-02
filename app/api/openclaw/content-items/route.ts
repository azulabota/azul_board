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

type UpdatePayload = {
  id?: number
  date?: string
  title?: string
  type?: string
  content?: string | null
  platform?: string
  status?: string
}

const requireSchedulerAccess = async (request: NextRequest) => {
  const auth = await authenticateApiKey(request)
  if ('error' in auth) {
    return auth
  }

  if (auth.status !== 'active') {
    return { error: 'User is not active', status: 403 as const }
  }

  if (!auth.canUseScheduler) {
    return { error: 'Scheduler access is required', status: 403 as const }
  }

  return auth
}

export async function GET(request: NextRequest) {
  const auth = await requireSchedulerAccess(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const status = url.searchParams.get('status')
  const limit = Math.min(Number(url.searchParams.get('limit') || 200), 500)

  const supabaseAdmin = createSupabaseAdminClient()
  let query = supabaseAdmin
    .from('content_items')
    .select('id, user_id, date, title, type, content, platform, status, created_at')
    .eq('user_id', auth.userId)
    .order('date', { ascending: true })
    .limit(limit)

  if (start) query = query.gte('date', start)
  if (end) query = query.lte('date', end)
  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireSchedulerAccess(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
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

export async function PATCH(request: NextRequest) {
  const auth = await requireSchedulerAccess(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => null)) as UpdatePayload | null
  const id = Number(body?.id)

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body?.date === 'string') update.date = body.date
  if (typeof body?.title === 'string') update.title = body.title.trim()
  if (typeof body?.type === 'string') update.type = body.type.trim()
  if (typeof body?.content === 'string') update.content = body.content
  if (body?.content === null) update.content = null
  if (typeof body?.platform === 'string') update.platform = body.platform.trim()
  if (typeof body?.status === 'string') update.status = body.status.trim()

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('content_items')
    .update(update)
    .eq('id', id)
    .eq('user_id', auth.userId)
    .select('id, user_id, date, title, type, content, platform, status, created_at')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
  }

  return NextResponse.json({ item: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSchedulerAccess(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const id = Number(url.searchParams.get('id'))

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 })
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { error } = await supabaseAdmin
    .from('content_items')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
