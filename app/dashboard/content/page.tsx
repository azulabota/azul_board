'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

type ContentItem = {
  id: number
  user_id: string
  date: string
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

  const [newPipeline, setNewPipeline] = useState({
    key: '',
    name: '',
    description: '',
    color: '#64748b',
    days: [1, 2, 3, 4, 5]
  })

  const [editingPipelineId, setEditingPipelineId] = useState<number | null>(null)
  const [editPipeline, setEditPipeline] = useState({
    key: '',
    name: '',
    description: '',
    color: '#64748b',
    days: [0, 1, 2, 3, 4, 5, 6]
  })

  const pipelineKeyOptions = useMemo(() => {
    if (pipelines.length === 0) return [{ value: 'short_form', label: 'Short Form' }]
    return pipelines.map((p) => ({ value: p.key, label: p.name }))
  }, [pipelines])

  const [newItem, setNewItem] = useState({ title: '', pipeline_key: 'short_form', content: '', platform: 'X' })

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
      .select('id, user_id, date, title, type, pipeline_key, content, status, platform')
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
      .select('id, user_id, key, name, description, color, days_of_week')
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
        days_of_week: p.days_of_week
      }))

      const { error: seedError } = await supabase.from('content_pipelines').insert(payload)
      if (seedError) {
        setPipelineError(seedError.message)
        return
      }

      const { data: seeded } = await supabase
        .from('content_pipelines')
        .select('id, user_id, key, name, description, color, days_of_week')
        .eq('user_id', uid)
        .order('created_at', { ascending: true })

      setPipelines(((seeded || []) as Pipeline[]).map((p) => ({ ...p })))
      setNewItem((prev) => ({ ...prev, pipeline_key: 'short_form' }))
      return
    }

    setPipelines(rows)
    // Ensure new item default points at an existing pipeline
    if (!rows.some((p) => p.key === newItem.pipeline_key)) {
      setNewItem((prev) => ({ ...prev, pipeline_key: rows[0].key }))
    }
  }

  const pipelineByKey = useMemo(() => {
    const map = new Map<string, Pipeline>()
    for (const p of pipelines) map.set(p.key, p)
    return map
  }, [pipelines])

  const colorForItem = (item: ContentItem) => {
    const k = item.pipeline_key || item.type
    return pipelineByKey.get(k)?.color || '#64748b'
  }

  const addContent = async () => {
    if (!selectedDate || !newItem.title.trim() || !userId) return

    setSaving(true)
    setError('')

    const pipelineKey = newItem.pipeline_key

    const { data, error: insertError } = await supabase
      .from('content_items')
      .insert({
        user_id: userId,
        date: selectedDate,
        title: newItem.title.trim(),
        type: pipelineKey, // backward compat
        pipeline_key: pipelineKey,
        content: newItem.content,
        status: 'scheduled',
        platform: newItem.platform
      })
      .select('id, user_id, date, title, type, pipeline_key, content, status, platform')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setContentItems((prev) => [...prev, data as ContentItem])
    setNewItem((prev) => ({ ...prev, title: '', content: '' }))
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
      days_of_week: newPipeline.days
    })

    if (insertError) {
      setPipelineError(insertError.message)
      setPipelineBusy(false)
      return
    }

    await loadPipelinesAndMaybeSeed(userId)
    setNewPipeline({ key: '', name: '', description: '', color: '#64748b', days: [1, 2, 3, 4, 5] })
    setPipelineBusy(false)
  }

  const startEditPipeline = (p: Pipeline) => {
    setEditingPipelineId(p.id)
    setEditPipeline({
      key: p.key,
      name: p.name,
      description: p.description || '',
      color: p.color,
      days: p.days_of_week || [0, 1, 2, 3, 4, 5, 6]
    })
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
        days_of_week: editPipeline.days
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

  const deletePipeline = async (p: Pipeline) => {
    if (!userId) return

    const inUse = contentItems.some((i) => (i.pipeline_key || i.type) === p.key)
    const msg = inUse
      ? `This pipeline is used by existing content. If you delete it, those items will keep the old key, but they\'ll show a gray color. Delete anyway?`
      : 'Delete this pipeline?'

    if (!confirm(msg)) return

    setPipelineBusy(true)
    setPipelineError('')

    const { error: delError } = await supabase.from('content_pipelines').delete().eq('id', p.id).eq('user_id', userId)

    if (delError) {
      setPipelineError(delError.message)
      setPipelineBusy(false)
      return
    }

    if (newItem.pipeline_key === p.key) {
      const next = pipelines.find((x) => x.key !== p.key)
      setNewItem((prev) => ({ ...prev, pipeline_key: next?.key || 'short_form' }))
    }

    await loadPipelinesAndMaybeSeed(userId)
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
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000', color: '#fff' }}>Loading calendar...</div>
  }

  if (!access || access.status !== 'active' || !access.canUseScheduler) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000', color: '#fff', padding: '1rem' }}>
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '1rem', maxWidth: '560px' }}>
          <h2 style={{ marginTop: 0 }}>No access</h2>
          <p style={{ color: '#aaa' }}>
            Your account does not have scheduler access. Contact an admin to enable `can_use_scheduler` and set your status to active.
          </p>
        </div>
      </div>
    )
  }

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  return (
    <div style={{ padding: '1.5rem', background: '#0a0a0a', minHeight: '100vh', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Content Calendar</h1>
          <button
            onClick={() => setShowManagePipelines((v) => !v)}
            style={{ padding: '8px 12px', background: showManagePipelines ? '#4c1d95' : '#333', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}
          >
            {showManagePipelines ? 'Hide Pipelines' : 'Manage Pipelines'}
          </button>
        </div>
        <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 12px', background: '#333', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
          Back to dashboard
        </button>
      </div>

      {error && <div style={{ marginBottom: '0.75rem', background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: '8px', padding: '0.75rem' }}>{error}</div>}

      {pipelineError && (
        <div style={{ marginBottom: '0.75rem', background: '#3b0a0a', border: '1px solid #dc2626', borderRadius: '8px', padding: '0.75rem' }}>
          Pipelines error: {pipelineError}
        </div>
      )}

      {showManagePipelines && (
        <div style={{ background: '#111', borderRadius: '12px', padding: '1rem', marginBottom: '1rem', border: '1px solid #222' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Pipelines</h2>
          <p style={{ marginTop: 0, color: '#aaa', fontSize: '0.9rem' }}>
            Pipelines control your posting categories (name, color, and which days you intend to post them).
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '10px', padding: '0.75rem' }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Create pipeline</h3>
              <input
                placeholder="Name"
                value={newPipeline.name}
                onChange={(e) => setNewPipeline((p) => ({ ...p, name: e.target.value, key: p.key || slugify(e.target.value) }))}
                style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', marginBottom: '0.5rem' }}
              />
              <input
                placeholder="Key (slug)"
                value={newPipeline.key}
                onChange={(e) => setNewPipeline((p) => ({ ...p, key: slugify(e.target.value) }))}
                style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', marginBottom: '0.5rem' }}
              />
              <input
                placeholder="Brief explanation"
                value={newPipeline.description}
                onChange={(e) => setNewPipeline((p) => ({ ...p, description: e.target.value }))}
                style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', marginBottom: '0.5rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <input type="color" value={newPipeline.color} onChange={(e) => setNewPipeline((p) => ({ ...p, color: e.target.value }))} />
                <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Color</span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {DOW.map((d) => (
                  <label key={d.i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: '#ddd' }}>
                    <input
                      type="checkbox"
                      checked={newPipeline.days.includes(d.i)}
                      onChange={() => setNewPipeline((p) => ({ ...p, days: toggleDay(p.days, d.i) }))}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
              <button
                onClick={() => void createPipeline()}
                disabled={pipelineBusy}
                style={{ width: '100%', padding: '0.55rem', background: '#6366f1', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', opacity: pipelineBusy ? 0.6 : 1 }}
              >
                {pipelineBusy ? 'Saving...' : 'Create'}
              </button>
            </div>

            <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '10px', padding: '0.75rem' }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Existing pipelines</h3>
              {pipelines.length === 0 ? (
                <div style={{ color: '#777' }}>No pipelines found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pipelines.map((p) => (
                    <div key={p.id} style={{ border: '1px solid #222', borderRadius: '10px', padding: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
                          <div>
                            <div style={{ fontWeight: 700 }}>{p.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#888' }}>{p.key}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => startEditPipeline(p)} style={{ padding: '6px 10px', background: '#333', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                            Edit
                          </button>
                          <button onClick={() => void deletePipeline(p)} style={{ padding: '6px 10px', background: '#dc2626', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                      {p.description && <div style={{ marginTop: '0.4rem', color: '#aaa', fontSize: '0.9rem' }}>{p.description}</div>}
                      <div style={{ marginTop: '0.5rem', color: '#aaa', fontSize: '0.85rem' }}>
                        Days: {DOW.filter((d) => p.days_of_week?.includes(d.i)).map((d) => d.label).join(', ') || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {editingPipelineId && (
            <div style={{ marginTop: '1rem', background: '#0a0a0a', border: '1px solid #222', borderRadius: '10px', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Edit pipeline</h3>
                <button onClick={() => setEditingPipelineId(null)} style={{ padding: '6px 10px', background: '#333', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Key (locked)</div>
                  <input value={editPipeline.key} disabled style={{ width: '100%', padding: '0.5rem', background: '#111', border: '1px solid #333', borderRadius: '6px', color: '#999', marginBottom: '0.5rem' }} />
                  <input
                    placeholder="Name"
                    value={editPipeline.name}
                    onChange={(e) => setEditPipeline((p) => ({ ...p, name: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', marginBottom: '0.5rem' }}
                  />
                  <input
                    placeholder="Brief explanation"
                    value={editPipeline.description}
                    onChange={(e) => setEditPipeline((p) => ({ ...p, description: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', marginBottom: '0.5rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <input type="color" value={editPipeline.color} onChange={(e) => setEditPipeline((p) => ({ ...p, color: e.target.value }))} />
                    <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Color</span>
                  </div>
                </div>
                <div>
                  <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Days of week</div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    {DOW.map((d) => (
                      <label key={d.i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: '#ddd' }}>
                        <input
                          type="checkbox"
                          checked={editPipeline.days.includes(d.i)}
                          onChange={() => setEditPipeline((p) => ({ ...p, days: toggleDay(p.days, d.i) }))}
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => void saveEditPipeline()}
                    disabled={pipelineBusy}
                    style={{ width: '100%', padding: '0.55rem', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', opacity: pipelineBusy ? 0.6 : 1 }}
                  >
                    {pipelineBusy ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {pipelines.map((p) => (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
            <span style={{ color: '#aaa' }}>{p.name}</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#111', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
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
            style={{ background: '#333', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}
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
            style={{ background: '#333', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}
          >
            →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem', marginBottom: '0.35rem' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', color: '#666', padding: '0.4rem' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
          {days.map((day, idx) => (
            <div
              key={idx}
              onClick={() => day && setSelectedDate(getDateStr(day))}
              style={{
                height: '62px',
                background: day && selectedDate === getDateStr(day) ? '#1a1a1a' : '#0a0a0a',
                border: day && selectedDate === getDateStr(day) ? '1px solid #444' : '1px solid transparent',
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
        <div style={{ background: '#111', borderRadius: '12px', padding: '1rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="Content title"
              value={newItem.title}
              onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff', marginBottom: '0.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <select
                value={newItem.pipeline_key}
                onChange={(e) => setNewItem({ ...newItem, pipeline_key: e.target.value })}
                style={{ flex: 1, padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff' }}
              >
                {pipelineKeyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={newItem.platform}
                onChange={(e) => setNewItem({ ...newItem, platform: e.target.value })}
                style={{ flex: 1, padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff' }}
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
              style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff', marginBottom: '0.5rem', minHeight: '60px' }}
            />
            <button
              onClick={addContent}
              disabled={saving || !newItem.title.trim()}
              style={{ width: '100%', padding: '0.5rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? 'Adding...' : 'Add content'}
            </button>
          </div>

          {getContentForDay(parseInt(selectedDate.split('-')[2], 10)).length === 0 ? (
            <div style={{ color: '#777' }}>No content scheduled for this day.</div>
          ) : (
            getContentForDay(parseInt(selectedDate.split('-')[2], 10)).map((item) => {
              const k = item.pipeline_key || item.type
              const pipeline = pipelineByKey.get(k)
              return (
                <div key={item.id} style={{ background: '#0a0a0a', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem', borderLeft: `3px solid ${colorForItem(item)}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: '0.8rem', color: '#888' }}>{item.platform}{pipeline ? ` • ${pipeline.name}` : ''}</div>
                    </div>
                    <button onClick={() => deleteContent(item.id)} style={{ padding: '6px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                  </div>
                  {item.content && <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#bbb' }}>{item.content}</div>}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
