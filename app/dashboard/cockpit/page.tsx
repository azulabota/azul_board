'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { ui, withDisabled } from '../../ui/styles'

type Thread = {
  id: number
  title: string | null
  updated_at: string
  created_at: string
}

type Message = {
  id: number
  thread_id: number
  role: 'user' | 'assistant' | 'system'
  content: string | null
  created_at: string
}

type Attachment = {
  id: number
  thread_id: number
  storage_path: string
  filename: string | null
  content_type: string | null
  size_bytes: number | null
  expires_at: string
  created_at: string
}

type ConnectionState = {
  bot_base_url: string
  has_bot_token: boolean
  has_openai_key: boolean
}

type AccountState = {
  id: string
  email: string
  status: 'pending' | 'active' | 'disabled'
  canUseDevDashboard: boolean
}

type Rect = { x: number; y: number; w: number; h: number; note?: string }

type AnnotationData = {
  version: 1
  rects: Rect[]
}

const addDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

export default function CodingCockpitPage() {
  const router = useRouter()

  const [account, setAccount] = useState<AccountState | null>(null)
  const [connection, setConnection] = useState<ConnectionState | null>(null)

  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<number>>(new Set())

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [waitingForAssistant, setWaitingForAssistant] = useState(false)
  const [error, setError] = useState('')
  const [composer, setComposer] = useState('')

  const [botBaseUrl, setBotBaseUrl] = useState('')
  const [botToken, setBotToken] = useState('')
  const [openAiKey, setOpenAiKey] = useState('')
  const [savingConnection, setSavingConnection] = useState(false)

  const [annotationAttachment, setAnnotationAttachment] = useState<Attachment | null>(null)
  const [annotationRects, setAnnotationRects] = useState<Rect[]>([])
  const [annotationNote, setAnnotationNote] = useState('')
  const [rectDraft, setRectDraft] = useState<Rect | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initialize = async () => {
    setLoading(true)
    setError('')

    try {
      const {
        data: { user },
        error: userErr
      } = await supabase.auth.getUser()

      if (userErr) {
        setError(userErr.message)
        return
      }

      if (!user) {
        router.push('/')
        return
      }

      const [profileRes, permRes] = await Promise.all([
        supabase.from('profiles').select('status, email').eq('id', user.id).maybeSingle(),
        supabase.from('user_permissions').select('can_use_dev_dashboard').eq('user_id', user.id).maybeSingle()
      ])

      if (profileRes.error) {
        setError(`Profile load failed: ${profileRes.error.message}`)
        return
      }
      if (permRes.error) {
        setError(`Permissions load failed: ${permRes.error.message}`)
        return
      }
      if (!profileRes.data) {
        setError('No profile found for this user.')
        return
      }

      const acct: AccountState = {
        id: user.id,
        email: (profileRes.data as any).email || user.email || '',
        status: (profileRes.data as any).status,
        canUseDevDashboard: Boolean(permRes.data?.can_use_dev_dashboard)
      }

      setAccount(acct)

      if (acct.status === 'pending') {
        router.push('/pending')
        return
      }

      if (acct.status !== 'active' || !acct.canUseDevDashboard) {
        return
      }

      await Promise.all([fetchThreads(), fetchConnection()])
    } catch (e: any) {
      setError(e?.message || 'Coding Cockpit failed to initialize')
    } finally {
      setLoading(false)
    }
  }

  const fetchThreads = async () => {
    const { data, error: e } = await supabase
      .from('cockpit_threads')
      .select('id, title, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(50)

    if (e) {
      setError(e.message)
      return
    }

    const rows = ((data || []) as Array<Thread | null>).filter(Boolean) as Thread[]
    setThreads(rows)

    if (!activeThreadId && rows.length) {
      setActiveThreadId(rows[0].id)
      await Promise.all([fetchMessages(rows[0].id), fetchAttachments(rows[0].id)])
      return
    }

    // Auto-create a first thread for better UX
    if (!activeThreadId && rows.length === 0) {
      const created = await createThread('General')
      if (created) {
        await Promise.all([fetchMessages(created.id), fetchAttachments(created.id)])
      }
    }
  }

  const fetchMessages = async (threadId: number) => {
    const { data, error: e } = await supabase
      .from('cockpit_messages')
      .select('id, thread_id, role, content, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(400)

    if (e) {
      setError(e.message)
      return [] as Message[]
    }

    const rows = (data || []) as Message[]
    setMessages(rows)
    return rows
  }

  const fetchAttachments = async (threadId: number) => {
    const { data, error: e } = await supabase
      .from('cockpit_attachments')
      .select('id, thread_id, storage_path, filename, content_type, size_bytes, expires_at, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (e) {
      setError(e.message)
      return
    }

    setAttachments((data || []) as Attachment[])
  }

  const fetchConnection = async () => {
    setError('')
    const {
      data: { session }
    } = await supabase.auth.getSession()

    const token = session?.access_token
    if (!token) return

    const res = await fetch('/api/cockpit/connection/get', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      setError(payload?.error || 'Failed to load connection settings')
      return
    }

    const next: ConnectionState = {
      bot_base_url: payload?.bot_base_url || '',
      has_bot_token: Boolean(payload?.has_bot_token),
      has_openai_key: Boolean(payload?.has_openai_key)
    }

    setConnection(next)
    setBotBaseUrl(next.bot_base_url)
  }

  const createThread = async (title?: string) => {
    setBusy(true)
    setError('')

    const finalTitle = (title || '').trim() || `Thread ${new Date().toLocaleString()}`
    const { data, error: e } = await supabase
      .from('cockpit_threads')
      .insert({ user_id: account!.id, title: finalTitle })
      .select('id, title, updated_at, created_at')
      .single()

    if (e || !data) {
      console.error('createThread failed', e)
      setError(e?.message || 'Failed to create thread')
      setBusy(false)
      return null
    }

    setThreads((prev) => [data as Thread, ...prev])
    setActiveThreadId((data as Thread).id)
    setMessages([])
    setAttachments([])
    setSelectedAttachmentIds(new Set())
    setBusy(false)
    return data as Thread
  }

  const handleSelectThread = async (threadId: number) => {
    setActiveThreadId(threadId)
    setSelectedAttachmentIds(new Set())
    await Promise.all([fetchMessages(threadId), fetchAttachments(threadId)])
  }

  const toggleSelectAttachment = (id: number) => {
    setSelectedAttachmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !activeThreadId || !account) return

    setBusy(true)
    setError('')

    for (const file of Array.from(files)) {
      const path = `${account.id}/${activeThreadId}/${Date.now()}_${file.name}`

      const { error: upErr } = await supabase.storage.from('cockpit').upload(path, file, {
        cacheControl: '3600',
        upsert: false
      })

      if (upErr) {
        setError(upErr.message)
        continue
      }

      const { error: insErr } = await supabase.from('cockpit_attachments').insert({
        user_id: account.id,
        thread_id: activeThreadId,
        storage_path: path,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
        expires_at: addDays(30)
      })

      if (insErr) {
        setError(insErr.message)
      }
    }

    await fetchAttachments(activeThreadId)
    setBusy(false)
  }

  const sendMessage = async () => {
    if (!activeThreadId || !composer.trim()) return

    setBusy(true)
    setError('')

    const {
      data: { session }
    } = await supabase.auth.getSession()

    const token = session?.access_token
    if (!token) {
      setError('Session expired. Please sign in again.')
      setBusy(false)
      return
    }

    const baselineMessageId = messages.length > 0 ? Math.max(...messages.map((m) => m.id)) : 0

    const res = await fetch('/api/cockpit/local-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        thread_id: activeThreadId,
        message: composer.trim(),
        selected_attachment_ids: Array.from(selectedAttachmentIds)
      })
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      setError(payload?.error || 'Failed to send message')
      setBusy(false)
      return
    }

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    const threadId = activeThreadId
    setComposer('')
    setBusy(false)
    setWaitingForAssistant(true)
    await Promise.all([fetchMessages(threadId), fetchThreads()])

    let foundAssistant = false
    const startedAt = Date.now()
    while (Date.now() - startedAt < 60_000) {
      await wait(2_000)
      const rows = await fetchMessages(threadId)
      if (rows.some((row) => row.role === 'assistant' && row.id > baselineMessageId)) {
        foundAssistant = true
        break
      }
    }

    if (!foundAssistant) {
      setError('Azul is still processing your request. Refresh shortly to see the reply.')
    }

    setWaitingForAssistant(false)
    await fetchThreads()
  }

  const saveConnection = async () => {
    setSavingConnection(true)
    setError('')

    const {
      data: { session }
    } = await supabase.auth.getSession()

    const token = session?.access_token
    if (!token) {
      setError('Session expired. Please sign in again.')
      setSavingConnection(false)
      return
    }

    const res = await fetch('/api/cockpit/connection/set', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        bot_base_url: botBaseUrl,
        ...(botToken ? { bot_token: botToken } : {}),
        ...(openAiKey ? { openai_key: openAiKey } : {})
      })
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      setError(payload?.error || 'Failed to save connection')
      setSavingConnection(false)
      return
    }

    setBotToken('')
    setOpenAiKey('')
    await fetchConnection()
    setSavingConnection(false)
  }

  const openAnnotate = async (att: Attachment) => {
    setAnnotationAttachment(att)
    setAnnotationRects([])
    setAnnotationNote('')

    const { data, error: e } = await supabase
      .from('cockpit_annotations')
      .select('data')
      .eq('attachment_id', att.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!e && data?.data) {
      const d = data.data as AnnotationData
      if (Array.isArray(d.rects)) setAnnotationRects(d.rects)
    }

    // load image into <img>
    const { data: signed } = await supabase.storage.from('cockpit').createSignedUrl(att.storage_path, 60 * 10)
    if (signed?.signedUrl) {
      // defer: image tag will load it
    }
  }

  const signedUrlFor = async (path: string) => {
    const { data } = await supabase.storage.from('cockpit').createSignedUrl(path, 60 * 10)
    return data?.signedUrl || ''
  }

  const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId) || null, [threads, activeThreadId])

  if (loading) {
    return (
      <div style={{ ...ui.page, display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
        <div style={{ ...ui.panel, padding: '1rem', maxWidth: 640 }}>
          <div style={{ fontWeight: 900, marginBottom: '0.25rem' }}>Loading Coding Cockpit…</div>
          <div style={{ color: 'var(--muted)' }}>
            If this takes more than ~10 seconds, refresh the page. If it still hangs, we’ll display the underlying error here.
          </div>
          {error && (
            <div style={{ marginTop: '0.75rem', background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '0.75rem' }}>
              <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>Error</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{error}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!account || account.status !== 'active' || !account.canUseDevDashboard) {
    return (
      <div style={{ ...ui.page, display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
        <div style={{ ...ui.panel, padding: '1rem', maxWidth: 520 }}>
          <h2 style={{ marginTop: 0 }}>No access</h2>
          <p style={{ color: 'var(--muted)' }}>Coding Cockpit requires approved dev dashboard access.</p>
          <button onClick={() => router.push('/dashboard')} style={ui.buttonSecondary}>
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...ui.page, padding: '1.25rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', marginBottom: '0.75rem' }}>
        {error && (
          <div style={{ background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: 12, padding: '0.75rem' }}>
            <div style={{ fontWeight: 900, marginBottom: '0.25rem' }}>Coding Cockpit error</div>
            <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{error}</div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
        {/* Threads */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Coding Cockpit</h1>
          </div>
          <button onClick={() => router.push('/dashboard')} style={ui.buttonSecondary}>
            Back
          </button>
          <button onClick={() => void createThread()} style={withDisabled(ui.buttonPrimary, busy)} disabled={busy}>
            + New thread
          </button>
          <div style={{ ...ui.panel, padding: '0.5rem', overflow: 'auto', flex: 1 }}>
            {threads.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No threads yet.</div>
            ) : (
              threads.filter(Boolean).map((t) => (
                <button
                  key={(t as any).id}
                  onClick={() => void handleSelectThread(t.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.6rem',
                    marginBottom: '0.35rem',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: t.id === activeThreadId ? 'var(--surface-2)' : 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{(t as any).title || `Thread ${(t as any).id}`}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{new Date((t as any).updated_at).toLocaleString()}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ ...ui.panel, padding: '0.75rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800 }}>{activeThread?.title || 'Select a thread'}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Attach files, highlight issues, and message your bot.</div>
            </div>
          </div>

          <div style={{ ...ui.panel, padding: '0.75rem', flex: 1, overflow: 'auto' }}>
            {activeThreadId ? (
              messages.length === 0 ? (
                <div style={{ color: 'var(--muted)' }}>No messages yet. Send something.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '78%',
                        background: m.role === 'user' ? 'rgba(228,58,75,0.12)' : 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: '0.6rem 0.75rem'
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>{m.role}</div>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>{m.content}</div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div style={{ color: 'var(--muted)' }}>Create a thread to start.</div>
            )}
          </div>

          <div style={{ ...ui.panel, padding: '0.75rem' }}>
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder="Describe what you want built/fixed. You can reference selected attachments."
              style={{
                ...ui.input,
                width: '100%',
                minHeight: 90,
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Selected attachments: <strong>{selectedAttachmentIds.size}</strong>
              </div>
              <button
                onClick={sendMessage}
                disabled={busy || waitingForAssistant || !activeThreadId || !composer.trim()}
                style={withDisabled(ui.buttonPrimary, busy || waitingForAssistant || !composer.trim())}
              >
                Send
              </button>
            </div>
            {waitingForAssistant && (
              <div style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.5rem' }}>Azul is thinking…</div>
            )}
          </div>
        </div>

        {/* Context panel */}
        <div style={{ width: 330, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ ...ui.panel, padding: '0.75rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Bot connection</h3>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Connect your OpenClaw relay (provider-agnostic). Token is encrypted at rest.
            </div>
            <input value={botBaseUrl} onChange={(e) => setBotBaseUrl(e.target.value)} placeholder="Bot base URL (https://...)" style={{ ...ui.input, width: '100%', marginBottom: '0.5rem' }} />
            <input value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder={connection?.has_bot_token ? 'Bot token (saved) — paste to replace' : 'Bot token'} style={{ ...ui.input, width: '100%', marginBottom: '0.5rem' }} />
            <input value={openAiKey} onChange={(e) => setOpenAiKey(e.target.value)} placeholder={connection?.has_openai_key ? 'OpenAI key (saved) — optional, paste to replace' : 'OpenAI key (optional fallback)'} style={{ ...ui.input, width: '100%', marginBottom: '0.5rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={saveConnection} disabled={savingConnection} style={withDisabled(ui.buttonPrimary, savingConnection)}>
                {savingConnection ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                disabled={savingConnection || busy}
                style={withDisabled(ui.buttonSecondary, savingConnection || busy)}
                onClick={async () => {
                  setBusy(true)
                  setError('')

                  const {
                    data: { session }
                  } = await supabase.auth.getSession()

                  const token = session?.access_token
                  if (!token) {
                    setError('Session expired. Please sign in again.')
                    setBusy(false)
                    return
                  }

                  const res = await fetch('/api/cockpit/connection/test', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${token}`
                    }
                  })

                  const payload = await res.json().catch(() => null)
                  if (!res.ok) {
                    setError(payload?.error || 'Bot connection test failed')
                    setBusy(false)
                    return
                  }

                  if (payload?.ok) {
                    setError('')
                    alert('Bot connection OK')
                  } else {
                    setError(payload?.error || 'Bot connection test failed')
                  }

                  setBusy(false)
                }}
              >
                Test
              </button>
            </div>
          </div>

          <div style={{ ...ui.panel, padding: '0.75rem', flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Attachments</h3>
              <label style={{ ...ui.buttonSecondary, display: 'inline-block' }}>
                Upload
                <input type="file" multiple style={{ display: 'none' }} onChange={(e) => void uploadFiles(e.target.files)} />
              </label>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>Auto-delete after 30 days (we’ll add cleanup automation next).</div>

            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
              {attachments.length === 0 ? (
                <div style={{ color: 'var(--muted)' }}>No attachments yet.</div>
              ) : (
                attachments.map((a) => (
                  <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input type="checkbox" checked={selectedAttachmentIds.has(a.id)} onChange={() => toggleSelectAttachment(a.id)} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{a.filename || `file_${a.id}`}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{a.content_type || 'unknown'}</div>
                        </div>
                      </label>
                      {a.content_type?.startsWith('image/') && (
                        <button
                          onClick={async () => {
                            const url = await signedUrlFor(a.storage_path)
                            if (imageRef.current) imageRef.current.src = url
                            setAnnotationAttachment(a)
                            setAnnotationRects([])
                            setRectDraft(null)
                          }}
                          style={ui.buttonSecondary}
                        >
                          Highlight
                        </button>
                      )}
                    </div>
                    <div style={{ marginTop: '0.4rem', color: 'var(--muted)', fontSize: '0.75rem' }}>
                      Expires: {new Date(a.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Annotation modal (MVP: rectangles only) */}
      {annotationAttachment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 3000,
            padding: '1rem'
          }}
          onClick={() => setAnnotationAttachment(null)}
        >
          <div
            style={{
              width: 'min(980px, 96vw)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '0.75rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800 }}>Highlight</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Drag to draw rectangles. Save to attach notes for your bot.</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    setAnnotationRects([])
                    setRectDraft(null)
                  }}
                  style={ui.buttonSecondary}
                >
                  Clear
                </button>
                <button
                  onClick={async () => {
                    if (!annotationAttachment) return
                    const data: AnnotationData = { version: 1, rects: annotationRects }
                    const { error: e } = await supabase.from('cockpit_annotations').insert({
                      user_id: account!.id,
                      attachment_id: annotationAttachment.id,
                      data
                    })
                    if (e) setError(e.message)
                    setAnnotationAttachment(null)
                  }}
                  style={ui.buttonPrimary}
                >
                  Save
                </button>
                <button onClick={() => setAnnotationAttachment(null)} style={ui.buttonDanger}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '0.75rem' }}>
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img ref={imageRef} alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />
                <canvas
                  ref={canvasRef}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  onMouseDown={(e) => {
                    const canvas = e.currentTarget
                    const rect = canvas.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    const y = e.clientY - rect.top
                    setRectDraft({ x, y, w: 0, h: 0 })
                  }}
                  onMouseMove={(e) => {
                    if (!rectDraft) return
                    const canvas = e.currentTarget
                    const rect = canvas.getBoundingClientRect()
                    const x2 = e.clientX - rect.left
                    const y2 = e.clientY - rect.top
                    setRectDraft((prev) => (prev ? { ...prev, w: x2 - prev.x, h: y2 - prev.y } : null))
                  }}
                  onMouseUp={() => {
                    if (!rectDraft) return
                    const fixed: Rect = {
                      x: rectDraft.w < 0 ? rectDraft.x + rectDraft.w : rectDraft.x,
                      y: rectDraft.h < 0 ? rectDraft.y + rectDraft.h : rectDraft.y,
                      w: Math.abs(rectDraft.w),
                      h: Math.abs(rectDraft.h)
                    }
                    if (fixed.w > 6 && fixed.h > 6) setAnnotationRects((prev) => [...prev, fixed])
                    setRectDraft(null)
                  }}
                />
              </div>

              <div style={{ ...ui.panelAlt, padding: '0.75rem' }}>
                <div style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Rects</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Tip: Save, then reference: “Fix rect #2”.
                </div>
                {annotationRects.length === 0 ? (
                  <div style={{ color: 'var(--muted)' }}>No highlights yet.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {annotationRects.map((r, idx) => (
                      <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700 }}>Rect #{idx + 1}</div>
                          <button
                            onClick={() => setAnnotationRects((prev) => prev.filter((_, i) => i !== idx))}
                            style={ui.buttonDanger}
                          >
                            Delete
                          </button>
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          x:{Math.round(r.x)} y:{Math.round(r.y)} w:{Math.round(r.w)} h:{Math.round(r.h)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* render rectangles */}
            <AnnotationRenderer canvasRef={canvasRef} imageRef={imageRef} rects={annotationRects} draft={rectDraft} />
          </div>
        </div>
      )}
    </div>
  )
}

function AnnotationRenderer({
  canvasRef,
  imageRef,
  rects,
  draft
}: {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
  imageRef: React.MutableRefObject<HTMLImageElement | null>
  rects: Rect[]
  draft: Rect | null
}) {
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // match canvas backing store to displayed size
      const { width, height } = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.scale(dpr, dpr)

      ctx.clearRect(0, 0, width, height)

      const paintRect = (r: Rect, color: string) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([])
        ctx.strokeRect(r.x, r.y, r.w, r.h)
        ctx.fillStyle = 'rgba(228,58,75,0.12)'
        ctx.fillRect(r.x, r.y, r.w, r.h)
      }

      rects.forEach((r) => paintRect(r, '#e43a4b'))
      if (draft) {
        const fixed: Rect = {
          x: draft.w < 0 ? draft.x + draft.w : draft.x,
          y: draft.h < 0 ? draft.y + draft.h : draft.y,
          w: Math.abs(draft.w),
          h: Math.abs(draft.h)
        }
        ctx.strokeStyle = '#60a5fa'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.strokeRect(fixed.x, fixed.y, fixed.w, fixed.h)
      }
    }

    // redraw on image load and whenever rects change
    const onLoad = () => draw()
    img.addEventListener('load', onLoad)
    draw()

    return () => {
      img.removeEventListener('load', onLoad)
    }
  }, [canvasRef, imageRef, rects, draft])

  return null
}
