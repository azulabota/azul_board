import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearerUser } from '../../../../lib/server-auth'
import { createSupabaseUserClient } from '../../../../lib/supabase-admin'

type LocalChatBody = {
  thread_id?: number
  message?: string
  selected_attachment_ids?: number[]
}

export async function POST(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active' || !auth.canUseDevDashboard) {
    return NextResponse.json({ error: 'Coding Cockpit requires active dev dashboard access' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as LocalChatBody | null
  const threadId = Number(body?.thread_id)
  const message = (body?.message || '').trim()
  const selectedAttachmentIds = Array.isArray(body?.selected_attachment_ids)
    ? Array.from(
        new Set(
          body!.selected_attachment_ids
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        )
      )
    : []

  if (!Number.isInteger(threadId) || threadId <= 0 || !message) {
    return NextResponse.json({ error: 'Missing required fields: thread_id, message' }, { status: 400 })
  }

  const supabase = createSupabaseUserClient(auth.token)

  const { data: thread, error: threadError } = await supabase
    .from('cockpit_threads')
    .select('id, user_id')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 500 })
  }

  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  if (selectedAttachmentIds.length > 0) {
    const { data: attachments, error: attachmentError } = await supabase
      .from('cockpit_attachments')
      .select('id')
      .eq('thread_id', threadId)
      .eq('user_id', auth.userId)
      .in('id', selectedAttachmentIds)

    if (attachmentError) {
      return NextResponse.json({ error: attachmentError.message }, { status: 500 })
    }

    if ((attachments || []).length !== selectedAttachmentIds.length) {
      return NextResponse.json({ error: 'One or more selected attachments are invalid' }, { status: 400 })
    }
  }

  const { error: messageError } = await supabase.from('cockpit_messages').insert({
    thread_id: threadId,
    user_id: auth.userId,
    role: 'user',
    content: message
  })

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 })
  }

  const { data: jobRow, error: jobError } = await supabase
    .from('cockpit_jobs')
    .insert({
      user_id: auth.userId,
      thread_id: threadId,
      prompt: message,
      selected_attachment_ids: selectedAttachmentIds,
      status: 'queued'
    })
    .select('id')
    .single()

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 })
  }

  await supabase.from('cockpit_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId).eq('user_id', auth.userId)

  return NextResponse.json({ ok: true, job_id: jobRow.id })
}
