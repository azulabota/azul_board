import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearerUser } from '../../../../lib/server-auth'
import { createSupabaseUserClient } from '../../../../lib/supabase-admin'

export async function GET(request: NextRequest) {
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

  const rawId = request.nextUrl.searchParams.get('id') || ''
  const jobId = Number(rawId)
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
  }

  const supabase = createSupabaseUserClient(auth.token)
  const { data: job, error } = await supabase
    .from('generation_jobs')
    .select('id, status, error, created_at, started_at, finished_at, payload')
    .eq('id', jobId)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const inserted = Number((job.payload as any)?.result?.inserted || 0)
  const generated = Number((job.payload as any)?.result?.generated || 0)

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      error: job.error,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
      result: {
        generated,
        inserted
      }
    }
  })
}
