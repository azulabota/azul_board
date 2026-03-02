import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearerUser } from '../../../../lib/server-auth'
import { createSupabaseUserClient } from '../../../../lib/supabase-admin'

type Body = {
  pipeline_key?: string // optional; if omitted, generate for all enabled pipelines
  days?: number // default 7
  platform?: string // default 'X'
}

type PipelineRow = {
  key: string
  name: string
  description: string | null
  days_of_week: number[]
  timezone: string | null
  post_time: string | null
  post_time_start: string | null
  post_time_end: string | null
  is_enabled: boolean
}

const isoDate = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function POST(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active') {
    return NextResponse.json({ error: 'User is not active' }, { status: 403 })
  }

  if (!auth.canUseScheduler) {
    return NextResponse.json({ error: 'Scheduler access is required' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as Body
  const days = Math.min(Math.max(Number(body.days || 7), 1), 31)
  const platform = (body.platform || 'X').trim() || 'X'
  const pipelineKey = typeof body.pipeline_key === 'string' ? body.pipeline_key.trim() : ''

  const supabase = createSupabaseUserClient(auth.token)

  // Pipelines
  let pipelinesQuery = supabase
    .from('content_pipelines')
    .select('key, name, description, days_of_week, timezone, post_time, post_time_start, post_time_end, is_enabled')
    .eq('user_id', auth.userId)
    .eq('is_enabled', true)

  if (pipelineKey) pipelinesQuery = pipelinesQuery.eq('key', pipelineKey)

  const { data: pipelineRows, error: pipelineError } = await pipelinesQuery

  if (pipelineError) {
    return NextResponse.json({ error: pipelineError.message }, { status: 500 })
  }

  const pipelines = (pipelineRows || []) as PipelineRow[]
  if (pipelines.length === 0) {
    return NextResponse.json({ error: 'No enabled pipelines found.' }, { status: 400 })
  }

  // Build desired slots: next N days, filtered by pipeline days_of_week
  const today = new Date()
  const slots: Array<{ date: string; scheduled_at: string | null; pipeline_key: string; pipeline_name: string; description: string | null }> = []

  for (let i = 0; i < days; i += 1) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const dow = d.getDay()
    const date = isoDate(d)

    for (const p of pipelines) {
      if (Array.isArray(p.days_of_week) && p.days_of_week.length && !p.days_of_week.includes(dow)) continue

      const time = (p.post_time || '').slice(0, 5) // HH:MM
      const scheduled_at = time ? `${date}T${time}:00` : null

      slots.push({
        date,
        scheduled_at,
        pipeline_key: p.key,
        pipeline_name: p.name,
        description: p.description || null
      })
    }
  }

  // Skip slots that already have an item for that pipeline/date
  const dates = Array.from(new Set(slots.map((s) => s.date)))
  const keys = Array.from(new Set(slots.map((s) => s.pipeline_key)))

  const { data: existingItems, error: existingError } = await supabase
    .from('content_items')
    .select('id, date, pipeline_key, type')
    .eq('user_id', auth.userId)
    .in('date', dates)
    .in('pipeline_key', keys)

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const existingSet = new Set(
    (existingItems || []).map((r: any) => `${r.date}::${r.pipeline_key || r.type}`)
  )

  const slotsToGenerate = slots.filter((s) => !existingSet.has(`${s.date}::${s.pipeline_key}`))

  if (slotsToGenerate.length === 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      message: 'Nothing to generate (all slots already filled).'
    })
  }

  const instructions = {
    tone: 'award-winning writer, 15 years experience',
    goals: ['engage followers', 'spark curiosity', 'gain followers', 'grow account'],
    constraints: ['No medical claims unless explicitly supported', 'Be concise and high-signal']
  }

  const { data: insertedJob, error: insertJobError } = await supabase
    .from('generation_jobs')
    .insert({
      user_id: auth.userId,
      kind: 'pipeline_week',
      pipeline_key: pipelineKey || null,
      days,
      platform,
      payload: {
        days,
        slots: slotsToGenerate,
        instructions
      }
    })
    .select('id, status')
    .single()

  if (insertJobError) {
    return NextResponse.json({ error: insertJobError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    job_id: insertedJob.id,
    status: insertedJob.status,
    queued: slotsToGenerate.length
  })
}
