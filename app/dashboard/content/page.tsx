'use client'
import { useState, useEffect } from 'react'

const SUPABASE_URL = 'https://jkliztcyclhlqhnywnzq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprbGl6dGN5Y2xobHFobnl3bnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTkwODIsImV4cCI6MjA4NzAzNTA4Mn0.MCU6jZ5gbpNuZEOYgc_JnNtzC6of56ooeEdGVS70EUY'

interface ContentItem {
  id: number
  date: string
  title: string
  type: 'article' | 'long_form' | 'am_motivation' | 'health_tip' | 'ai_health' | 'nighttime_reflection' | 'short_form' | 'topic_pipeline' | string
  content: string
  status: 'scheduled' | 'posted' | 'draft'
  platform: string
}

const CONTENT_TYPES = {
  article: { label: 'Article', color: '#ec4899' },        // Pink
  long_form: { label: 'Long Form', color: '#8b5cf6' }, // Purple
  am_motivation: { label: 'AM Motivation', color: '#f59e0b' }, // Amber
  health_tip: { label: 'Health Tip', color: '#10b981' }, // Green
  ai_health: { label: 'AI + Health', color: '#3b82f6' }, // Blue
  nighttime_reflection: { label: 'Nighttime Reflection', color: '#6366f1' }, // Indigo
  short_form: { label: 'Short Form', color: '#64748b' }, // Slate
  topic_pipeline: { label: 'Topic Pipeline', color: '#ef4444' } // Red (fallback)
}

export default function ContentCalendar() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [newItem, setNewItem] = useState({ title: '', type: 'short_form' as const, content: '', platform: 'X' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/content?order=date.asc`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    })
    .then(res => res.json())
    .then(data => setContentItems(data || []))
    .catch(console.error)
  }, [])

  // Generate calendar days for current month
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay()

  const days = []
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  const getContentForDay = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return contentItems.filter(item => item.date === dateStr)
  }

  const getDayColor = (day: number) => {
    const items = getContentForDay(day)
    if (items.length === 0) return 'transparent'
    // Priority: article > long_form > am_motivation > health_tip > ai_health > nighttime > topic
    if (items.some(i => i.type === 'article')) return CONTENT_TYPES.article.color
    if (items.some(i => i.type === 'long_form')) return CONTENT_TYPES.long_form.color
    if (items.some(i => i.type === 'am_motivation')) return CONTENT_TYPES.am_motivation.color
    if (items.some(i => i.type === 'health_tip')) return CONTENT_TYPES.health_tip.color
    if (items.some(i => i.type === 'ai_health')) return CONTENT_TYPES.ai_health.color
    if (items.some(i => i.type === 'nighttime_reflection')) return CONTENT_TYPES.nighttime_reflection.color
    return CONTENT_TYPES.short_form.color
  }

  const addContent = async () => {
    if (!selectedDate || !newItem.title) return
    setLoading(true)
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/content`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        title: newItem.title,
        date: selectedDate,
        type: newItem.type,
        content: newItem.content,
        status: 'scheduled',
        platform: newItem.platform
      })
    })
    
    if (res.ok) {
      const newItemWithId: ContentItem = {
        id: Date.now(),
        date: selectedDate,
        title: newItem.title,
        type: newItem.type,
        content: newItem.content,
        status: 'scheduled',
        platform: newItem.platform
      }
      setContentItems([...contentItems, newItemWithId])
      setNewItem({ title: '', type: 'short_form', content: '', platform: 'X' })
    }
    setLoading(false)
  }

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  return (
    <div style={{ padding: '1.5rem', background: '#0a0a0a', minHeight: '100vh', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>📅 Content Calendar</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {Object.entries(CONTENT_TYPES).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: val.color }} />
              <span style={{ color: '#888' }}>{val.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div style={{ background: '#111', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          {months[currentMonth]} {currentYear}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', color: '#666', padding: '0.5rem' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
          {days.map((day, idx) => (
            <div
              key={idx}
              onClick={() => day && setSelectedDate(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)}
              style={{
                height: '60px',
                background: selectedDate === `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` ? '#1a1a1a' : '#0a0a0a',
                border: selectedDate === `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` ? '1px solid #333' : '1px solid transparent',
                borderRadius: '8px',
                padding: '0.5rem',
                cursor: day ? 'pointer' : 'default',
                position: 'relative'
              }}
            >
              {day && (
                <>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{day}</div>
                  {getContentForDay(day).length > 0 && (
                    <div style={{ position: 'absolute', bottom: '4px', left: '4px', right: '4px', display: 'flex', gap: '2px' }}>
                      {getContentForDay(day).slice(0, 3).map((item, i) => (
                        <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: CONTENT_TYPES[item.type as keyof typeof CONTENT_TYPES]?.color || '#64748b' }} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected Day Content */}
      {selectedDate && (
        <div style={{ background: '#111', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem' }}>
              {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <button
              onClick={() => setSelectedDate(null)}
              style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.25rem' }}
            >
              ✕
            </button>
          </div>

          {/* Add New Content */}
          <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>Add New Content</div>
            <input
              type="text"
              placeholder="Content title..."
              value={newItem.title}
              onChange={e => setNewItem({ ...newItem, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff', marginBottom: '0.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <select
                value={newItem.type}
                onChange={e => setNewItem({ ...newItem, type: e.target.value as any })}
                style={{ flex: 1, padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff' }}
              >
                {Object.entries(CONTENT_TYPES).filter(([key]) => key !== 'short_form').map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
              <select
                value={newItem.platform}
                onChange={e => setNewItem({ ...newItem, platform: e.target.value })}
                style={{ flex: 1, padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff' }}
              >
                <option value="X">X</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Instagram">Instagram</option>
                <option value="YouTube">YouTube</option>
              </select>
            </div>
            <textarea
              placeholder="Content details..."
              value={newItem.content}
              onChange={e => setNewItem({ ...newItem, content: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', background: '#000', border: '1px solid #333', borderRadius: '4px', color: '#fff', marginBottom: '0.5rem', minHeight: '60px' }}
            />
            <button
              onClick={addContent}
              disabled={loading || !newItem.title}
              style={{ width: '100%', padding: '0.5rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
            >
              {loading ? 'Adding...' : 'Add Content'}
            </button>
          </div>

          {/* Content List */}
          <div>
            {getContentForDay(parseInt(selectedDate.split('-')[2])).length === 0 ? (
              <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No content scheduled for this day</div>
            ) : (
              getContentForDay(parseInt(selectedDate.split('-')[2])).map(item => (
                <div key={item.id} style={{ background: '#0a0a0a', borderRadius: '8px', padding: '1rem', marginBottom: '0.5rem', borderLeft: `3px solid ${(CONTENT_TYPES as any)[item.type]?.color || '#64748b'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: '600' }}>{item.title}</div>
                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: (CONTENT_TYPES as any)[item.type]?.color + '20', color: (CONTENT_TYPES as any)[item.type]?.color }}>
                      {(CONTENT_TYPES as any)[item.type]?.label || 'Post'}
                    </span>
                  </div>
                  {item.content && <div style={{ fontSize: '0.875rem', color: '#888', marginBottom: '0.5rem' }}>{item.content}</div>}
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>📱 {item.platform}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
