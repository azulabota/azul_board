import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'
import { authenticateApiKey } from '../../../../lib/server-auth'

export async function GET(request: NextRequest) {
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

  const url = new URL(request.url)
  const enabledOnly = url.searchParams.get('enabledOnly') === 'true'

  const supabaseAdmin = createSupabaseAdminClient()
  let query = supabaseAdmin
    .from('content_pipelines')
    .select('id, user_id, key, name, description, color, days_of_week, is_enabled, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: true })

  if (enabledOnly) {
    query = query.eq('is_enabled', true)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ pipelines: data || [] })
}
