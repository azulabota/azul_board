import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '../../../../lib/supabase-admin'
import { authenticateApiKey } from '../../../../lib/server-auth'

type RevisionPayload = {
  milestone_id?: number
  title?: string
  description?: string | null
  code_snippet?: string | null
  file_name?: string | null
  priority?: string
  status?: string
  assignee?: string
  create_task?: boolean
  task?: {
    title?: string
    description?: string | null
    status?: string
    priority?: string
    assignee?: string
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active') {
    return NextResponse.json({ error: 'User is not active' }, { status: 403 })
  }

  if (!auth.canUseDevDashboard) {
    return NextResponse.json({ error: 'Development dashboard access is required' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as RevisionPayload | null
  const milestoneId = Number(body?.milestone_id)

  if (!Number.isFinite(milestoneId) || milestoneId <= 0 || !body?.title?.trim()) {
    return NextResponse.json({ error: 'Missing required fields: milestone_id, title' }, { status: 400 })
  }

  const supabaseAdmin = createSupabaseAdminClient()

  const { data: revision, error: revisionError } = await supabaseAdmin
    .from('revisions')
    .insert({
      milestone_id: milestoneId,
      title: body.title.trim(),
      description: typeof body.description === 'string' ? body.description : '',
      code_snippet: typeof body.code_snippet === 'string' ? body.code_snippet : null,
      file_name: typeof body.file_name === 'string' ? body.file_name : null,
      priority: body.priority?.trim() || 'medium',
      status: body.status?.trim() || 'todo',
      assignee: body.assignee?.trim() || 'Unassigned',
      created_by: auth.email || 'OpenClaw API'
    })
    .select('id, milestone_id, title, description, code_snippet, file_name, priority, status, assignee, created_by, created_at')
    .single()

  if (revisionError) {
    return NextResponse.json({ error: revisionError.message }, { status: 500 })
  }

  let task: Record<string, unknown> | null = null

  if (body.create_task) {
    const taskTitle = body.task?.title?.trim() || `Rev: ${body.title.trim()}`
    const { data: taskData, error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert({
        milestone_id: milestoneId,
        title: taskTitle,
        description: typeof body.task?.description === 'string' ? body.task.description : '',
        status: body.task?.status?.trim() || 'todo',
        priority: body.task?.priority?.trim() || body.priority?.trim() || 'medium',
        assignee: body.task?.assignee?.trim() || body.assignee?.trim() || 'Unassigned',
        created_by: auth.email || 'OpenClaw API'
      })
      .select('id, milestone_id, title, description, status, priority, assignee, created_by, created_at')
      .single()

    if (taskError) {
      return NextResponse.json({ error: taskError.message, revision }, { status: 500 })
    }

    task = taskData
  }

  return NextResponse.json({ revision, task }, { status: 201 })
}
