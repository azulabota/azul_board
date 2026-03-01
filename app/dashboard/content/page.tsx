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
  content: string | null
  status: string
  platform: string
}

type AccessState = {
  status: 'pending' | 'active' | 'disabled'
  canUseScheduler: boolean
}

const CONTENT_TYPES: Record<string, { label: string; color: string }> = {
  article: { label: 'Article', color: '#ec4899' },
  long_form: { label: 'Long Form', color: '#8b5cf6' },
  am_motivation: { label: 'AM Motivation', color: '#f59e0b' },
  health_tip: { label: 'Health Tip', color: '#10b981' },
  ai_health: { label: 'AI + Health', color: '#3b82f6' },
  nighttime_reflection: { label: 'Nighttime Reflection', color: '#6366f1' },
  daily_wellness_reminder: { label: 'Daily Wellness Reminder', color: '#14b8a6' },
  short_form: { label: 'Short Form', color: '#64748b' },
  app_build: { label: 'App Build', color: '#ef4444' },
  app_build_long: { label: 'App Build Long', color: '#f97316' }
}

export default function ContentCalendar() {
  const router = useRouter()
  const [access, setAccess] = useState<AccessState | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [newItem, setNewItem] = useState({ title: '', type: 'short_form', content: '', platform: 'X' })

  useEffect(() => {
    void initialize()
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
      await loadItems(user.id)
    }

    setLoading(false)
  }

  const loadItems = async (uid: string) => {
    const { data, error: fetchError } = await supabase
      .from('content_items')
      .select('id, user_id, date, title, type, content, status, platform')
      .eq('user_id', uid)
      .order('date', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    setContentItems(data || [])
  }

  const addContent = async () => {
    if (!selectedDate || !newItem.title.trim() || !userId) return

    setSaving(true)
    setError('')

    const { data, error: insertError } = await supabase
      .from('content_items')
      .insert({
        user_id: userId,
        date: selectedDate,
        title: newItem.title.trim(),
        type: newItem.type,
        content: newItem.content,
        status: 'scheduled',
        platform: newItem.platform
      })
      .select('id, user_id, date, title, type, content, status, platform')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setContentItems((prev) => [...prev, data])
    setNewItem({ title: '', type: 'short_form', content: '', platform: 'X' })
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
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Content Calendar</h1>
        <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 12px', background: '#333', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
          Back to dashboard
        </button>
      </div>

      {error && <div style={{ marginBottom: '0.75rem', background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: '8px', padding: '0.75rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {Object.entries(CONTENT_TYPES).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: val.color }} />
            <span style={{ color: '#aaa' }}>{val.label}</span>
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
                      <div key={item.id} style={{ flex: 1, height: '4px', borderRadius: '2px', background: CONTENT_TYPES[item.type]?.color || '#64748b' }} />
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
                value={newItem.type}
                onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                style={{ flex: 1, padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff' }}
              >
                {Object.entries(CONTENT_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
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
            getContentForDay(parseInt(selectedDate.split('-')[2], 10)).map((item) => (
              <div key={item.id} style={{ background: '#0a0a0a', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem', borderLeft: `3px solid ${CONTENT_TYPES[item.type]?.color || '#64748b'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}>{item.platform}</div>
                  </div>
                  <button onClick={() => deleteContent(item.id)} style={{ padding: '6px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                </div>
                {item.content && <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#bbb' }}>{item.content}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
