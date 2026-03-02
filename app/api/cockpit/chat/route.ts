import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearerUser } from '../../../../lib/server-auth'
import { createSupabaseUserClient } from '../../../../lib/supabase-admin'
import { decryptSecret } from '../../../../lib/encryption'

type ChatBody = {
  thread_id?: number
  message?: string
  selected_attachment_ids?: number[]
}

const parseOpenAiReply = (payload: any) => {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()
  }

  return ''
}

export async function POST(request: NextRequest) {
  const auth = await authenticateBearerUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (auth.status !== 'active' || !auth.canUseDevDashboard) {
    return NextResponse.json({ error: 'Coding Cockpit requires active dev dashboard access' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as ChatBody | null
  const threadId = Number(body?.thread_id)
  const message = (body?.message || '').trim()
  const selectedAttachmentIds = Array.isArray(body?.selected_attachment_ids)
    ? body!.selected_attachment_ids
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
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

  const { data: attachmentRows, error: attachmentError } = await supabase
    .from('cockpit_attachments')
    .select('id, thread_id, storage_path, filename, content_type, size_bytes, expires_at')
    .eq('thread_id', threadId)
    .eq('user_id', auth.userId)
    .in('id', selectedAttachmentIds.length ? selectedAttachmentIds : [-1])

  if (attachmentError) {
    return NextResponse.json({ error: attachmentError.message }, { status: 500 })
  }

  const { data: connection, error: connectionError } = await supabase
    .from('user_ai_connections')
    .select('bot_base_url, bot_token_ciphertext, bot_token_iv, bot_token_tag, openai_key_ciphertext, openai_key_iv, openai_key_tag')
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (connectionError) {
    return NextResponse.json({ error: connectionError.message }, { status: 500 })
  }

  const botBaseUrl = (connection?.bot_base_url || '').trim().replace(/\/+$/, '')
  const botToken = decryptSecret({
    ciphertext: connection?.bot_token_ciphertext || '',
    iv: connection?.bot_token_iv || '',
    tag: connection?.bot_token_tag || ''
  })
  const openaiKey = decryptSecret({
    ciphertext: connection?.openai_key_ciphertext || '',
    iv: connection?.openai_key_iv || '',
    tag: connection?.openai_key_tag || ''
  })

  let assistantReply = ''

  if (botBaseUrl && botToken) {
    const upstream = await fetch(`${botBaseUrl}/cockpit/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${botToken}`
      },
      body: JSON.stringify({
        thread_id: threadId,
        message,
        selected_attachment_ids: selectedAttachmentIds,
        attachments: attachmentRows || []
      })
    })

    const upstreamBody = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      return NextResponse.json(
        { error: upstreamBody?.error || 'Bot request failed. Please verify the bot URL/token.' },
        { status: 502 }
      )
    }

    assistantReply =
      (typeof upstreamBody?.reply === 'string' && upstreamBody.reply.trim()) ||
      (typeof upstreamBody?.message === 'string' && upstreamBody.message.trim()) ||
      ''
  } else if (openaiKey) {
    const attachmentSummary = (attachmentRows || [])
      .map((row) => `${row.filename || 'file'} (${row.content_type || 'unknown'}, ${row.storage_path})`)
      .join('\n')

    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are Coding Cockpit. Keep answers direct and actionable.'
          },
          {
            role: 'user',
            content: attachmentSummary
              ? `Message:\n${message}\n\nSelected attachments:\n${attachmentSummary}`
              : message
          }
        ]
      })
    })

    const openAiBody = await openAiRes.json().catch(() => null)
    if (!openAiRes.ok) {
      return NextResponse.json(
        { error: openAiBody?.error?.message || 'OpenAI request failed. Please verify your API key.' },
        { status: 502 }
      )
    }

    assistantReply = parseOpenAiReply(openAiBody)
  } else {
    return NextResponse.json(
      {
        error: 'No bot or OpenAI connection configured yet. Open Coding Cockpit and save a bot URL/token or OpenAI key first.'
      },
      { status: 400 }
    )
  }

  if (!assistantReply) {
    assistantReply = 'I could not generate a response. Please try again.'
  }

  const { error: insertError } = await supabase.from('cockpit_messages').insert([
    {
      thread_id: threadId,
      user_id: auth.userId,
      role: 'user',
      content: message
    },
    {
      thread_id: threadId,
      user_id: auth.userId,
      role: 'assistant',
      content: assistantReply
    }
  ])

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  await supabase
    .from('cockpit_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', auth.userId)

  return NextResponse.json({ reply: assistantReply })
}
