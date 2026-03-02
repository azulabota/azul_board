'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { ui, withDisabled } from '../../ui/styles'
import ThemeToggle from '../../theme-toggle'

type ContentItem = {
  id: number
  user_id: string
  date: string
  scheduled_at: string | null
  title: string
  type: string
  pipeline_key: string | null
  content: string | null
  status: string
  platform: string
}

type AccessState = {
  status: 'pending' | 'active' | 'disabled'
  canUseScheduler: boolean
}

type Pipeline = {
  id: number
  user_id: string
  key: string
  name: string
  description: string | null
  color: string
  days_of_week: number[]
  is_enabled: boolean
  timezone?: string | null
  post_time?: string | null
  post_time_start?: string | null
  post_time_end?: string | null

  gen_length?: 'short' | 'medium' | 'long' | 'thread'
  gen_min_words?: number | null
  gen_max_words?: number | null
  gen_must_start_with?: string | null
  gen_must_end_question?: boolean
  gen_include_cta?: boolean
  gen_no_hashtags?: boolean
  gen_no_emojis?: boolean
}

type GenerationJobState = {
  id: number
  status: 'queued' | 'running' | 'done' | 'failed'
  error?: string | null
  result?: {
    generated: number
    inserted: number
  }
}

const DEFAULT_PIPELINES: Array<Pick<Pipeline, 'key' | 'name' | 'description' | 'color' | 'days_of_week'>> = [
  { key: 'article', name: 'Article', description: 'Long-form written content', color: '#ec4899', days_of_week: [1, 3, 5] },
  { key: 'long_form', name: 'Long Form', description: 'Longer posts, threads, or deep dives', color: '#8b5cf6', days_of_week: [2] },
  { key: 'am_motivation', name: 'AM Motivation', description: 'Morning motivation / mindset', color: '#f59e0b', days_of_week: [1, 2, 3, 4, 5] },
  { key: 'health_tip', name: 'Health Tip', description: 'Quick health tip', color: '#10b981', days_of_week: [1, 3, 5] },
  { key: 'ai_health', name: 'AI + Health', description: 'AI + health insights', color: '#3b82f6', days_of_week: [4] },
  { key: 'nighttime_reflection', name: 'Nighttime Reflection', description: 'Evening reflection', color: '#6366f1', days_of_week: [0, 2, 4] },
  { key: 'daily_wellness_reminder', name: 'Daily Wellness Reminder', description: 'Daily reminder prompt', color: '#14b8a6', days_of_week: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'short_form', name: 'Short Form', description: 'Short posts / quick hits', color: '#64748b', days_of_week: [1, 2, 3, 4, 5] },
  { key: 'app_build', name: 'App Build', description: 'Short dev/build update', color: '#ef4444', days_of_week: [2, 5] },
  { key: 'app_build_long', name: 'App Build Long', description: 'Longer dev/build writeup', color: '#f97316', days_of_week: [6] }
]

const DOW = [
  { i: 0, label: 'Sun' },
  { i: 1, label: 'Mon' },
  { i: 2, label: 'Tue' },
  { i: 3, label: 'Wed' },
  { i: 4, label: 'Thu' },
  { i: 5, label: 'Fri' },
  { i: 6, label: 'Sat' }
]

const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export default function ContentCalendar() {
  const router = useRouter()
  const [access, setAccess] = useState<AccessState | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const [viewYear, setViewYear] = useState(new Date().getFullYear())

  const [showManagePipelines, setShowManagePipelines] = useState(false)
  const [pipelineBusy, setPipelineBusy] = useState(false)
  const [pipelineError, setPipelineError] = useState('')
  const [generationJob, setGenerationJob] = useState<GenerationJobState | null>(null)
  const [generationDays, setGenerationDays] = useState<7 | 14 | 30>(7)

  const [newPipeline, setNewPipeline] = useState({
    key: '',
    name: '',
    description: '',
    color: '#64748b',
    days: [1, 2, 3, 4, 5],
    post_time: '09:00'
  })

  const [editingPipelineId, setEditingPipelineId] = useState<number | null>(null)
  const editPanelRef = useState<{ current: HTMLDivElement | null }>({ current: null })[0]
  const [editPipeline, setEditPipeline] = useState({
    key: '',
    name: '',
    description: '',
    color: '#64748b',
    days: [0, 1, 2, 3, 4, 5, 6],
    post_time: '09:00',

    gen_length: 'short' as 'short' | 'medium' | 'long' | 'thread',
    gen_min_words: 0,
    gen_max_words: 0,
    gen_must_start_with: '',
    gen_must_end_question: false,
    gen_include_cta: true,
    gen_no_hashtags: true,
    gen_no_emojis: true
  })
  const [pendingDeletePipeline, setPendingDeletePipeline] = useState<Pipeline | null>(null)
  const [deleteMode, setDeleteMode] = useState<'reassign' | 'none'>('reassign')
  const [deleteToPipelineKey, setDeleteToPipelineKey] = useState('')

  const pipelineKeyOptions = useMemo(() => {
    if (pipelines.length === 0) return [{ value: 'short_form', label: 'Short Form', disabled: false }]
    return pipelines.map((p) => ({ value: p.key, label: p.name, disabled: !p.is_enabled }))
  }, [pipelines])

  const [newItem, setNewItem] = useState({ title: '', pipeline_key: 'short_form', content: '', platform: 'X', time: '' })

  useEffect(() => {
    void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initialize = async () => {
    setLoading(true)
    setError('')

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/')
      return
    }

    setUserId(user.id)

    const [profileRes, permissionRes] = await Promise.all([
      supabase.from('profiles').select('status').eq('id', user.id).maybeSingle(),
      supabase.from('user_permissions').select('can_use_scheduler').eq('user_id', user.id).maybeSingle()
    ])

    if (profileRes.error || permissionRes.error || !profileRes.data) {
      setError('Unable to load access settings.')
      setLoading(false)
      return
    }

    const nextAccess: AccessState = {
      status: profileRes.data.status,
      canUseScheduler: Boolean(permissionRes.data?.can_use_scheduler)
    }

    setAccess(nextAccess)

    if (nextAccess.status === 'pending') {
      router.push('/pending')
      return
    }

    if (nextAccess.status === 'active' && nextAccess.canUseScheduler) {
      await loadPipelinesAndMaybeSeed(user.id)
      await loadItems(user.id)
    }

    setLoading(false)
  }

  const loadItems = async (uid: string) => {
    const { data, error: fetchError } = await supabase
      .from('content_items')
      .select('id, user_id, date, scheduled_at, title, type, pipeline_key, content, status, platform')
      .eq('user_id', uid)
      .order('date', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    setContentItems((data || []) as ContentItem[])
  }

  const loadPipelinesAndMaybeSeed = async (uid: string) => {
    setPipelineError('')

    const { data, error: fetchError } = await supabase
      .from('content_pipelines')
      .select('id, user_id, key, name, description, color, days_of_week, is_enabled, timezone, post_time, post_time_start, post_time_end, gen_length, gen_min_words, gen_max_words, gen_must_start_with, gen_must_end_question, gen_include_cta, gen_no_hashtags, gen_no_emojis')
      .eq('user_id', uid)
      .order('created_at', { ascending: true })

    if (fetchError) {
      // Migration might not be applied yet.
      setPipelineError(fetchError.message)
      return
    }

    const rows = (data || []) as Pipeline[]

    if (rows.length === 0) {
      const payload = DEFAULT_PIPELINES.map((p) => ({
        user_id: uid,
        key: p.key,
        name: p.name,
        description: p.description,
        color: p.color,
        days_of_week: p.days_of_week,
        is_enabled: true,
        timezone: 'America/Denver',
        post_time: '09:00'
      }))

      const { error: seedError } = await supabase.from('content_pipelines').insert(payload)
      if (seedError) {
        setPipelineError(seedError.message)
        return
      }

      const { data: seeded } = await supabase
        .from('content_pipelines')
        .select('id, user_id, key, name, description, color, days_of_week, is_enabled, timezone, post_time, post_time_start, post_time_end, gen_length, gen_min_words, gen_max_words, gen_must_start_with, gen_must_end_question, gen_include_cta, gen_no_hashtags, gen_no_emojis')
        .eq('user_id', uid)
        .order('created_at', { ascending: true })

      setPipelines(((seeded || []) as Pipeline[]).map((p) => ({ ...p, is_enabled: (p as any).is_enabled ?? true })))
      setNewItem((prev) => ({ ...prev, pipeline_key: 'short_form' }))
      return
    }

    setPipelines(rows)
    // Ensure new item default points at an existing pipeline
    if (!rows.some((p) => p.key === newItem.pipeline_key)) {
      setNewItem((prev) => ({ ...prev, pipeline_key: rows[0].key }))
    }
  }

  const loadGenerationJobStatus = async (jobId: number) => {
    const {
      data: { session }
    } = await supabase.auth.getSession()

    const token = session?.access_token
    if (!token) {
      setPipelineError('Session expired. Please sign in again.')
      return null
    }

    const res = await fetch(`/api/calendar/generation-job?id=${jobId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      setPipelineError(payload?.error || 'Failed to check generation job status')
      return null
    }

    const job = payload?.job as GenerationJobState
    setGenerationJob(job)
    return job
  }

  useEffect(() => {
    if (!generationJob || (generationJob.status !== 'queued' && generationJob.status !== 'running')) return
    const interval = setInterval(() => {
      void loadGenerationJobStatus(generationJob.id).then(async (job) => {
        if (!job) return
        if (job.status === 'done') {
          if (userId) await loadItems(userId)
          setPipelineBusy(false)
        } else if (job.status === 'failed') {
          setPipelineBusy(false)
          setPipelineError(job.error || 'Generation failed')
        }
      })
    }, 2000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationJob?.id, generationJob?.status, userId])

  const pipelineByKey = useMemo(() => {
    const map = new Map<string, Pipeline>()
    for (const p of pipelines) map.set(p.key, p)
    return map
  }, [pipelines])

  const deleteTargetUsageCount = useMemo(() => {
    if (!pendingDeletePipeline) return 0
    return contentItems.filter((item) => (item.pipeline_key || item.type) === pendingDeletePipeline.key).length
  }, [contentItems, pendingDeletePipeline])

  const reassignPipelineOptions = useMemo(() => {
    if (!pendingDeletePipeline) return []
    return pipelines.filter((p) => p.key !== pendingDeletePipeline.key)
  }, [pendingDeletePipeline, pipelines])

  const colorForItem = (item: ContentItem) => {
    const k = item.pipeline_key || item.type
    return pipelineByKey.get(k)?.color || '#64748b'
  }

  const addContent = async () => {
    if (!selectedDate || !newItem.title.trim() || !userId) return

    setSaving(true)
    setError('')

    const pipelineKey = newItem.pipeline_key

    const pipeline = pipelineByKey.get(pipelineKey)
    const chosenTime = (newItem.time || '').trim() || (pipeline?.post_time as string | undefined) || ''
    const scheduledAt = chosenTime ? `${selectedDate}T${chosenTime}:00` : null

    const { data, error: insertError } = await supabase
      .from('content_items')
      .insert({
        user_id: userId,
        date: selectedDate,
        scheduled_at: scheduledAt,
        title: newItem.title.trim(),
        type: pipelineKey, // backward compat
        pipeline_key: pipelineKey,
        content: newItem.content,
        status: 'scheduled',
        platform: newItem.platform
      })
      .select('id, user_id, date, scheduled_at, title, type, pipeline_key, content, status, platform')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setContentItems((prev) => [...prev, data as ContentItem])
    setNewItem((prev) => ({ ...prev, title: '', content: '', time: '' }))
    setSaving(false)
  }

  const deleteContent = async (id: number) => {
    setError('')
    const { error: deleteError } = await supabase.from('content_items').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setContentItems((prev) => prev.filter((item) => item.id !== id))
  }

  const copyForScheduler = async (item: ContentItem) => {
    try {
      const pipeline = pipelineByKey.get(item.pipeline_key || item.type)
      const header = `${item.platform}${pipeline ? ` • ${pipeline.name}` : ''}`
      const when = item.scheduled_at ? `Scheduled: ${new Date(item.scheduled_at).toLocaleString()}` : `Date: ${item.date}`
      const text = [header, when, '', item.content || item.title].join('\n')

      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard')
    } catch {
      alert('Copy failed. Your browser may have blocked clipboard access.')
    }
  }

  const createPipeline = async () => {
    if (!userId) return
    setPipelineBusy(true)
    setPipelineError('')

    const key = slugify(newPipeline.key || newPipeline.name)
    const name = newPipeline.name.trim()

    if (!key || !name) {
      setPipelineError('Pipeline needs a name (and key).')
      setPipelineBusy(false)
      return
    }

    const { error: insertError } = await supabase.from('content_pipelines').insert({
      user_id: userId,
      key,
      name,
      description: newPipeline.description.trim() || null,
      color: newPipeline.color,
      days_of_week: newPipeline.days,
      timezone: 'America/Denver',
      post_time: newPipeline.post_time || null,
      gen_length: 'short',
      gen_no_hashtags: true,
      gen_no_emojis: true,
      gen_include_cta: true
    })

    if (insertError) {
      setPipelineError(insertError.message)
      setPipelineBusy(false)
      return
    }

    await loadPipelinesAndMaybeSeed(userId)
    setNewPipeline({ key: '', name: '', description: '', color: '#64748b', days: [1, 2, 3, 4, 5], post_time: '09:00' })
    setPipelineBusy(false)
  }

  const startEditPipeline = (p: Pipeline) => {
    setEditingPipelineId(p.id)
    setEditPipeline({
      key: p.key,
      name: p.name,
      description: p.description || '',
      color: p.color,
      days: p.days_of_week || [0, 1, 2, 3, 4, 5, 6],
      post_time: (p.post_time as string | undefined) || '09:00',

      gen_length: (p.gen_length as any) || 'short',
      gen_min_words: Number(p.gen_min_words || 0),
      gen_max_words: Number(p.gen_max_words || 0),
      gen_must_start_with: (p.gen_must_start_with as any) || '',
      gen_must_end_question: Boolean(p.gen_must_end_question),
      gen_include_cta: p.gen_include_cta !== false,
      gen_no_hashtags: p.gen_no_hashtags !== false,
      gen_no_emojis: p.gen_no_emojis !== false
    })

    // Bring the edit panel into view (it renders below the list)
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const saveEditPipeline = async () => {
    if (!userId || !editingPipelineId) return
    setPipelineBusy(true)
    setPipelineError('')

    const name = editPipeline.name.trim()
    if (!name) {
      setPipelineError('Name is required')
      setPipelineBusy(false)
      return
    }

    // Key is immutable for simplicity (since content_items refer to it). Allow changing name/desc/color/days.
    const { error: updateError } = await supabase
      .from('content_pipelines')
      .update({
        name,
        description: editPipeline.description.trim() || null,
        color: editPipeline.color,
        days_of_week: editPipeline.days,
        post_time: (editPipeline as any).post_time || null,

        gen_length: (editPipeline as any).gen_length,
        gen_min_words: (editPipeline as any).gen_min_words || null,
        gen_max_words: (editPipeline as any).gen_max_words || null,
        gen_must_start_with: (editPipeline as any).gen_must_start_with?.trim() || null,
        gen_must_end_question: Boolean((editPipeline as any).gen_must_end_question),
        gen_include_cta: Boolean((editPipeline as any).gen_include_cta),
        gen_no_hashtags: Boolean((editPipeline as any).gen_no_hashtags),
        gen_no_emojis: Boolean((editPipeline as any).gen_no_emojis)
      })
      .eq('id', editingPipelineId)
      .eq('user_id', userId)

    if (updateError) {
      setPipelineError(updateError.message)
      setPipelineBusy(false)
      return
    }

    setEditingPipelineId(null)
    await loadPipelinesAndMaybeSeed(userId)
    setPipelineBusy(false)
  }

  const deletePipeline = (p: Pipeline) => {
    const options = pipelines.filter((x) => x.key !== p.key)
    setPendingDeletePipeline(p)
    setDeleteMode(options.length ? 'reassign' : 'none')
    setDeleteToPipelineKey(options[0]?.key || '')
  }

  const confirmDeletePipeline = async () => {
    if (!userId || !pendingDeletePipeline) return

    const target = pendingDeletePipeline
    setPipelineBusy(true)
    setPipelineError('')

    if (deleteTargetUsageCount > 0) {
      if (deleteMode === 'reassign') {
        if (!deleteToPipelineKey) {
          setPipelineError('Select a destination pipeline before deleting.')
          setPipelineBusy(false)
          return
        }

        const { error: moveAssignedError } = await supabase
          .from('content_items')
          .update({ pipeline_key: deleteToPipelineKey })
          .eq('user_id', userId)
          .eq('pipeline_key', target.key)

        if (moveAssignedError) {
          setPipelineError(moveAssignedError.message)
          setPipelineBusy(false)
          return
        }

        const { error: moveLegacyError } = await supabase
          .from('content_items')
          .update({ pipeline_key: deleteToPipelineKey })
          .eq('user_id', userId)
          .is('pipeline_key', null)
          .eq('type', target.key)

        if (moveLegacyError) {
          setPipelineError(moveLegacyError.message)
          setPipelineBusy(false)
          return
        }
      } else {
        const { error: clearError } = await supabase
          .from('content_items')
          .update({ pipeline_key: null })
          .eq('user_id', userId)
          .eq('pipeline_key', target.key)

        if (clearError) {
          setPipelineError(clearError.message)
          setPipelineBusy(false)
          return
        }
      }
    }

    const { error: delError } = await supabase.from('content_pipelines').delete().eq('id', target.id).eq('user_id', userId)

    if (delError) {
      setPipelineError(delError.message)
      setPipelineBusy(false)
      return
    }

    if (newItem.pipeline_key === target.key) {
      const next = pipelines.find((x) => x.key !== target.key)
      setNewItem((prev) => ({ ...prev, pipeline_key: next?.key || 'short_form' }))
    }

    setPendingDeletePipeline(null)
    await Promise.all([loadPipelinesAndMaybeSeed(userId), loadItems(userId)])
    setPipelineBusy(false)
  }

  const toggleDay = (days: number[], d: number) => {
    const set = new Set(days)
    if (set.has(d)) set.delete(d)
    else set.add(d)
    return Array.from(set).sort((a, b) => a - b)
  }

  const daysInMonth = useMemo(() => new Date(viewYear, viewMonth + 1, 0).getDate(), [viewMonth, viewYear])
  const firstDayOfMonth = useMemo(() => new Date(viewYear, viewMonth, 1).getDay(), [viewMonth, viewYear])

  const days = useMemo(() => {
    const result: Array<number | null> = []
    for (let i = 0; i < firstDayOfMonth; i += 1) result.push(null)
    for (let i = 1; i <= daysInMonth; i += 1) result.push(i)
    return result
  }, [daysInMonth, firstDayOfMonth])

  const getDateStr = (day: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const getContentForDay = (day: number) => {
    const dateStr = getDateStr(day)
    return contentItems.filter((item) => item.date === dateStr)
  }

  if (loading) {
    return <div style={{ ...ui.page, display: 'grid', placeItems: 'center' }}>Loading calendar...</div>
  }

  if (!access || access.status !== 'active' || !access.canUseScheduler) {
    return (
      <div style={{ ...ui.page, display: 'grid', placeItems: 'center', padding: '1rem' }}>
        <div style={{ ...ui.panel, padding: '1rem', maxWidth: '560px' }}>
          <h2 style={{ marginTop: 0 }}>No access</h2>
          <p style={{ color: 'var(--muted)' }}>
            Your account does not have scheduler access. Contact an admin to enable `can_use_scheduler` and set your status to active.
          </p>
        </div>
      </div>
    )
  }

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div style={{ ...ui.page, minHeight: '100vh', display: 'flex' }}>
      <aside
        style={{
          width: 240,
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}
      >
        <strong>Sapien Eleven</strong>
        <button onClick={() => router.push('/dashboard')} style={ui.buttonSecondary}>
          Dashboard
        </button>
        <button style={{ ...ui.buttonPrimary, boxShadow: '0 0 0 1px rgba(228, 58, 75, 0.32) inset' }} disabled>
          Calendar
        </button>
        <button onClick={() => router.push('/settings')} style={ui.buttonSecondary}>
          Settings
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Theme</div>
        <ThemeToggle style={{ background: 'var(--surface-2)' }} />
        <button onClick={handleLogout} style={ui.buttonDanger}>
          Logout
        </button>
      </aside>

      <div style={{ flex: 1, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Content Calendar</h1>
          <button
            onClick={() => setShowManagePipelines((v) => !v)}
            style={showManagePipelines ? ui.buttonPrimary : ui.buttonSecondary}
          >
            {showManagePipelines ? 'Hide Pipelines' : 'Manage Pipelines'}
          </button>
        </div>
        <button onClick={() => router.push('/dashboard')} style={ui.buttonSecondary}>
          Back to dashboard
        </button>
      </div>

      {error && <div style={{ marginBottom: '0.75rem', background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: '8px', padding: '0.75rem' }}>{error}</div>}

      {pipelineError && (
        <div style={{ marginBottom: '0.75rem', background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: '8px', padding: '0.75rem' }}>
          Pipelines error: {pipelineError}
        </div>
      )}

      {showManagePipelines && (
        <div style={{ ...ui.panel, padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Pipelines</h2>
          </div>
          <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
            Pipelines control your posting categories (name, color, and which days you intend to post them).
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ ...ui.panelAlt, padding: '0.75rem' }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Create pipeline</h3>
              <input
                placeholder="Name"
                value={newPipeline.name}
                onChange={(e) => setNewPipeline((p) => ({ ...p, name: e.target.value, key: p.key || slugify(e.target.value) }))}
                style={{ ...ui.input, marginBottom: '0.5rem' }}
              />
              <input
                placeholder="Key (slug)"
                value={newPipeline.key}
                onChange={(e) => setNewPipeline((p) => ({ ...p, key: slugify(e.target.value) }))}
                style={{ ...ui.input, marginBottom: '0.5rem' }}
              />
              <input
                placeholder="Brief explanation"
                value={newPipeline.description}
                onChange={(e) => setNewPipeline((p) => ({ ...p, description: e.target.value }))}
                style={{ ...ui.input, marginBottom: '0.5rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <input type="color" value={newPipeline.color} onChange={(e) => setNewPipeline((p) => ({ ...p, color: e.target.value }))} />
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Color</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Post time (local)</div>
                  <input
                    type="time"
                    value={newPipeline.post_time}
                    onChange={(e) => setNewPipeline((p) => ({ ...p, post_time: e.target.value }))}
                    style={ui.input}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Days of week</div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {DOW.map((d) => (
                      <label key={d.i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--text)' }}>
                        <input
                          type="checkbox"
                          checked={newPipeline.days.includes(d.i)}
                          onChange={() => setNewPipeline((p) => ({ ...p, days: toggleDay(p.days, d.i) }))}
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => void createPipeline()}
                disabled={pipelineBusy}
                style={withDisabled({ ...ui.buttonPrimary, width: '100%', padding: '0.55rem' }, pipelineBusy)}
              >
                {pipelineBusy ? 'Saving...' : 'Create'}
              </button>
            </div>

            <div style={{ ...ui.panelAlt, padding: '0.75rem' }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Existing pipelines</h3>
              {pipelines.length === 0 ? (
                <div style={{ color: 'var(--muted)' }}>No pipelines found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pipelines.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '0.6rem',
                        opacity: p.is_enabled ? 1 : 0.5
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
                          <div>
                            <div style={{ fontWeight: 700 }}>{p.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{p.key}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                            <input
                              type="checkbox"
                              checked={p.is_enabled}
                              onChange={async (e) => {
                                const next = e.target.checked
                                setPipelineError('')
                                setPipelineBusy(true)
                                const { error: updateErr } = await supabase
                                  .from('content_pipelines')
                                  .update({ is_enabled: next })
                                  .eq('id', p.id)
                                  .eq('user_id', userId)

                                if (updateErr) {
                                  setPipelineError(updateErr.message)
                                } else {
                                  setPipelines((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_enabled: next } : x)))
                                }
                                setPipelineBusy(false)
                              }}
                              disabled={pipelineBusy}
                            />
                            {p.is_enabled ? 'On' : 'Off'}
                          </label>
                          <button
                            onClick={() => {
                              startEditPipeline(p)
                              // Small UX: scroll + generate button lives inside edit panel
                            }}
                            style={ui.buttonSecondary}
                            disabled={pipelineBusy}
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              // Open edit panel and scroll into view, then user can hit Generate.
                              // (We keep generation behind the explicit Generate button for safety.)
                              startEditPipeline(p)
                            }}
                            style={{
                              ...ui.buttonGhost,
                              border: '1px solid rgba(96, 165, 250, 0.85)',
                              boxShadow: '0 0 0 1px rgba(96, 165, 250, 0.18) inset'
                            }}
                            disabled={pipelineBusy}
                            title="Open this pipeline and generate next 7 days"
                          >
                            Gen
                          </button>
                          <button onClick={() => deletePipeline(p)} style={ui.buttonDanger} disabled={pipelineBusy}>
                            Delete
                          </button>
                        </div>
                      </div>
                      {p.description && <div style={{ marginTop: '0.4rem', color: 'var(--muted)', fontSize: '0.9rem' }}>{p.description}</div>}
                      <div style={{ marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                        Days: {DOW.filter((d) => p.days_of_week?.includes(d.i)).map((d) => d.label).join(', ') || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingDeletePipeline && (
                <div style={{ ...ui.panel, marginTop: '0.8rem', padding: '0.75rem' }}>
                  <h4 style={{ margin: '0 0 0.35rem 0' }}>Delete "{pendingDeletePipeline.name}"</h4>
                  {deleteTargetUsageCount > 0 ? (
                    <>
                      <p style={{ margin: '0 0 0.5rem 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                        This pipeline is used by {deleteTargetUsageCount} post{deleteTargetUsageCount === 1 ? '' : 's'}. Choose where those posts should go before deleting.
                      </p>
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <input
                            type="radio"
                            checked={deleteMode === 'reassign'}
                            onChange={() => setDeleteMode('reassign')}
                            disabled={!reassignPipelineOptions.length}
                          />
                          <span>Move posts to another pipeline</span>
                        </label>
                        <select
                          value={deleteToPipelineKey}
                          onChange={(e) => setDeleteToPipelineKey(e.target.value)}
                          style={{ ...ui.input, opacity: deleteMode === 'reassign' ? 1 : 0.75 }}
                          disabled={deleteMode !== 'reassign' || reassignPipelineOptions.length === 0}
                        >
                          {reassignPipelineOptions.length === 0 ? (
                            <option value="">No destination pipelines available</option>
                          ) : (
                            reassignPipelineOptions.map((p) => (
                              <option key={p.id} value={p.key}>{p.name}</option>
                            ))
                          )}
                        </select>
                        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <input type="radio" checked={deleteMode === 'none'} onChange={() => setDeleteMode('none')} />
                          <span>Move posts to no pipeline (set pipeline_key to null)</span>
                        </label>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: '0 0 0.5rem 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                      No posts currently use this pipeline. Confirm deletion.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.65rem' }}>
                    <button onClick={() => setPendingDeletePipeline(null)} style={ui.buttonSecondary} disabled={pipelineBusy}>
                      Cancel
                    </button>
                    <button onClick={() => void confirmDeletePipeline()} style={withDisabled(ui.buttonDanger, pipelineBusy)} disabled={pipelineBusy}>
                      {pipelineBusy ? 'Deleting...' : 'Confirm delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {editingPipelineId && (
            <div ref={(el) => { editPanelRef.current = el }} style={{ ...ui.panelAlt, marginTop: '1rem', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Edit pipeline</h3>
                <button onClick={() => setEditingPipelineId(null)} style={ui.buttonSecondary}>
                  Close
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Key (locked)</div>
                  <input value={editPipeline.key} disabled style={{ ...ui.input, color: 'var(--muted)', marginBottom: '0.5rem' }} />
                  <input
                    placeholder="Name"
                    value={editPipeline.name}
                    onChange={(e) => setEditPipeline((p) => ({ ...p, name: e.target.value }))}
                    style={{ ...ui.input, marginBottom: '0.5rem' }}
                  />
                  <input
                    placeholder="Brief explanation"
                    value={editPipeline.description}
                    onChange={(e) => setEditPipeline((p) => ({ ...p, description: e.target.value }))}
                    style={{ ...ui.input, marginBottom: '0.5rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <input type="color" value={editPipeline.color} onChange={(e) => setEditPipeline((p) => ({ ...p, color: e.target.value }))} />
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Color</span>
                  </div>
                </div>
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Post time (local)</div>
                      <input
                        type="time"
                        value={(editPipeline as any).post_time}
                        onChange={(e) => setEditPipeline((p) => ({ ...p, post_time: e.target.value }))}
                        style={ui.input}
                      />
                    </div>
                    <div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Days of week</div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        {DOW.map((d) => (
                          <label key={d.i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--text)' }}>
                            <input
                              type="checkbox"
                              checked={editPipeline.days.includes(d.i)}
                              onChange={() => setEditPipeline((p) => ({ ...p, days: toggleDay(p.days, d.i) }))}
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ ...ui.panelAlt, padding: '0.65rem', marginBottom: '0.65rem' }}>
                    <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Generation settings</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Length
                        <select
                          value={(editPipeline as any).gen_length}
                          onChange={(e) => {
                            const v = e.target.value as 'short' | 'medium' | 'long' | 'thread'
                            const defaults =
                              v === 'long'
                                ? { gen_min_words: 120, gen_max_words: 220 }
                                : v === 'medium'
                                  ? { gen_min_words: 45, gen_max_words: 110 }
                                  : { gen_min_words: 0, gen_max_words: 0 }
                            setEditPipeline((p) => ({ ...p, gen_length: v, ...defaults }))
                          }}
                          style={{ ...ui.input, padding: '0.45rem 0.5rem' }}
                          disabled={pipelineBusy}
                        >
                          <option value="short">Short</option>
                          <option value="medium">Medium</option>
                          <option value="long">Long</option>
                        </select>
                      </label>

                      <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Must start with (optional)
                        <input
                          value={(editPipeline as any).gen_must_start_with}
                          onChange={(e) => setEditPipeline((p) => ({ ...p, gen_must_start_with: e.target.value }))}
                          style={{ ...ui.input, padding: '0.45rem 0.5rem' }}
                          placeholder='e.g. Good Morning'
                          disabled={pipelineBusy}
                        />
                      </label>

                      <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Min words (Long)
                        <input
                          type="number"
                          value={(editPipeline as any).gen_min_words}
                          onChange={(e) => setEditPipeline((p) => ({ ...p, gen_min_words: Number(e.target.value) }))}
                          style={{ ...ui.input, padding: '0.45rem 0.5rem' }}
                          disabled={pipelineBusy || (editPipeline as any).gen_length !== 'long'}
                        />
                      </label>

                      <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Max words (Long)
                        <input
                          type="number"
                          value={(editPipeline as any).gen_max_words}
                          onChange={(e) => setEditPipeline((p) => ({ ...p, gen_max_words: Number(e.target.value) }))}
                          style={{ ...ui.input, padding: '0.45rem 0.5rem' }}
                          disabled={pipelineBusy || (editPipeline as any).gen_length !== 'long'}
                        />
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        <input
                          type="checkbox"
                          checked={Boolean((editPipeline as any).gen_no_hashtags)}
                          onChange={(e) => setEditPipeline((p) => ({ ...p, gen_no_hashtags: e.target.checked }))}
                          disabled={pipelineBusy}
                        />
                        No hashtags
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        <input
                          type="checkbox"
                          checked={Boolean((editPipeline as any).gen_no_emojis)}
                          onChange={(e) => setEditPipeline((p) => ({ ...p, gen_no_emojis: e.target.checked }))}
                          disabled={pipelineBusy}
                        />
                        No emojis
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        <input
                          type="checkbox"
                          checked={Boolean((editPipeline as any).gen_include_cta)}
                          onChange={(e) => setEditPipeline((p) => ({ ...p, gen_include_cta: e.target.checked }))}
                          disabled={pipelineBusy}
                        />
                        Include CTA
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        <input
                          type="checkbox"
                          checked={Boolean((editPipeline as any).gen_must_end_question)}
                          onChange={(e) => setEditPipeline((p) => ({ ...p, gen_must_end_question: e.target.checked }))}
                          disabled={pipelineBusy}
                        />
                        End with a question
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                      Days
                      <select
                        value={generationDays}
                        onChange={(e) => setGenerationDays(Number(e.target.value) as 7 | 14 | 30)}
                        style={{ ...ui.input, minWidth: '6rem', padding: '0.4rem 0.5rem' }}
                        disabled={pipelineBusy}
                      >
                        <option value={7}>7</option>
                        <option value={14}>14</option>
                        <option value={30}>30</option>
                      </select>
                    </label>
                    <button
                      onClick={() => void saveEditPipeline()}
                      disabled={pipelineBusy}
                      style={withDisabled({ ...ui.buttonSuccess, flex: 1, padding: '0.55rem' }, pipelineBusy)}
                    >
                      {pipelineBusy ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                      onClick={async () => {
                        setPipelineError('')
                        setGenerationJob(null)
                        setPipelineBusy(true)
                        const {
                          data: { session }
                        } = await supabase.auth.getSession()

                        const token = session?.access_token
                        if (!token) {
                          setPipelineError('Session expired. Please sign in again.')
                          setPipelineBusy(false)
                          return
                        }

                        const res = await fetch('/api/calendar/generate-week', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                          },
                          body: JSON.stringify({ pipeline_key: editPipeline.key, days: generationDays, platform: 'X' })
                        })

                        const payload = await res.json().catch(() => null)
                        if (!res.ok) {
                          setPipelineError(payload?.error || 'Failed to generate')
                          setPipelineBusy(false)
                          return
                        }

                        if (!payload?.job_id) {
                          if (Number(payload?.queued || 0) === 0) {
                            setGenerationJob(null)
                            setPipelineBusy(false)
                            return
                          }
                          setPipelineError('Job did not return an id')
                          setPipelineBusy(false)
                          return
                        }

                        setGenerationJob({
                          id: Number(payload.job_id),
                          status: payload.status || 'queued'
                        })

                        if ((payload.status || 'queued') === 'done') {
                          await loadItems(userId)
                          setPipelineBusy(false)
                        }
                      }}
                      disabled={pipelineBusy}
                      style={withDisabled({ ...ui.buttonPrimary, flex: 1, padding: '0.55rem' }, pipelineBusy)}
                    >
                      {pipelineBusy ? 'Queueing…' : `Generate ${generationDays} days`}
                    </button>
                  </div>
                  {generationJob && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: generationJob.status === 'failed' ? 'var(--danger)' : 'var(--muted)' }}>
                      Job #{generationJob.id}: {generationJob.status}
                      {generationJob.status === 'done' && generationJob.result
                        ? ` (${generationJob.result.inserted} drafts inserted)`
                        : ''}
                      {generationJob.status === 'failed' && generationJob.error ? ` - ${generationJob.error}` : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {pipelines.map((p) => (
          <div
            key={p.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.75rem',
              opacity: p.is_enabled ? 1 : 0.5
            }}
          >
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
            <span style={{ color: 'var(--muted)' }}>{p.name}</span>
          </div>
        ))}
      </div>

      <div style={{ ...ui.panel, padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button
            onClick={() => {
              if (viewMonth === 0) {
                setViewMonth(11)
                setViewYear(viewYear - 1)
              } else {
                setViewMonth(viewMonth - 1)
              }
            }}
            style={ui.buttonSecondary}
          >
            ←
          </button>
          <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>{months[viewMonth]} {viewYear}</span>
          <button
            onClick={() => {
              if (viewMonth === 11) {
                setViewMonth(0)
                setViewYear(viewYear + 1)
              } else {
                setViewMonth(viewMonth + 1)
              }
            }}
            style={ui.buttonSecondary}
          >
            →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem', marginBottom: '0.35rem' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', padding: '0.4rem' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
          {days.map((day, idx) => (
            <div
              key={idx}
              onClick={() => day && setSelectedDate(getDateStr(day))}
              style={{
                height: '62px',
                background: day && selectedDate === getDateStr(day) ? 'var(--surface-2)' : 'var(--surface)',
                border: day && selectedDate === getDateStr(day) ? '1px solid var(--accent)' : '1px solid transparent',
                borderRadius: '8px',
                padding: '0.5rem',
                cursor: day ? 'pointer' : 'default',
                position: 'relative'
              }}
            >
              {day && (
                <>
                  <div style={{ fontSize: '0.85rem' }}>{day}</div>
                  <div style={{ position: 'absolute', bottom: '4px', left: '4px', right: '4px', display: 'flex', gap: '2px' }}>
                    {getContentForDay(day).slice(0, 3).map((item) => (
                      <div key={item.id} style={{ flex: 1, height: '4px', borderRadius: '2px', background: colorForItem(item) }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedDate && (
        <div style={{ ...ui.panel, padding: '1rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          <div style={{ ...ui.panelAlt, padding: '0.75rem', marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="Content title"
              value={newItem.title}
              onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
              style={{ ...ui.input, marginBottom: '0.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <select
                value={newItem.pipeline_key}
                onChange={(e) => {
                  const key = e.target.value
                  const p = pipelineByKey.get(key)
                  setNewItem({
                    ...newItem,
                    pipeline_key: key,
                    time: (p?.post_time as string | undefined) || ''
                  })
                }}
                style={{ ...ui.input, flex: 1 }}
              >
                {pipelineKeyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={Boolean((opt as any).disabled)}>
                    {opt.label}{(opt as any).disabled ? ' (OFF)' : ''}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={newItem.time}
                onChange={(e) => setNewItem({ ...newItem, time: e.target.value })}
                style={{ ...ui.input, flex: 1 }}
              />
              <select
                value={newItem.platform}
                onChange={(e) => setNewItem({ ...newItem, platform: e.target.value })}
                style={{ ...ui.input, flex: 1 }}
              >
                <option value="X">X</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Instagram">Instagram</option>
                <option value="YouTube">YouTube</option>
              </select>
            </div>
            <textarea
              placeholder="Content details"
              value={newItem.content}
              onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
              style={{ ...ui.input, marginBottom: '0.5rem', minHeight: '60px' }}
            />
            <button
              onClick={addContent}
              disabled={saving || !newItem.title.trim()}
              style={withDisabled({ ...ui.buttonPrimary, width: '100%' }, saving || !newItem.title.trim())}
            >
              {saving ? 'Adding...' : 'Add content'}
            </button>
          </div>

          {getContentForDay(parseInt(selectedDate.split('-')[2], 10)).length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No content scheduled for this day.</div>
          ) : (
            getContentForDay(parseInt(selectedDate.split('-')[2], 10)).map((item) => {
              const k = item.pipeline_key || item.type
              const pipeline = pipelineByKey.get(k)
              return (
                <div key={item.id} style={{ ...ui.panelAlt, padding: '0.75rem', marginBottom: '0.5rem', borderLeft: `3px solid ${colorForItem(item)}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{item.platform}{pipeline ? ` • ${pipeline.name}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button onClick={() => void copyForScheduler(item)} style={ui.buttonGhost}>Copy</button>
                      <button onClick={() => deleteContent(item.id)} style={ui.buttonDanger}>Delete</button>
                    </div>
                  </div>
                  {item.content && <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}>{item.content}</div>}
                </div>
              )
            })
          )}
        </div>
      )}
      </div>
    </div>
  )
}
