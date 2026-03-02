'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { ui } from '../ui/styles'

type Status = 'todo' | 'in_progress' | 'blocked' | 'done'
type TopTab = 'progress' | 'dev'

interface Milestone {
  id: number
  title: string
  created_at?: string
}

interface Task {
  id: number
  milestone_id: number
  title: string
  description: string | null
  status: Status
  priority: string | null
  assignee: string | null
  created_by: string | null
  created_at?: string
  type: 'task' | 'bug'
}

interface Revision {
  id: number
  milestone_id: number
  title: string
  description: string | null
  what_changed: string | null
  next_steps: string | null
  status: Status
  assignee: string | null
  created_by: string | null
  created_at?: string
}

interface Profile {
  id: string
  email: string | null
  first_name: string | null
  status: 'pending' | 'active' | 'disabled'
}

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' }
]

export default function Dashboard() {
  const router = useRouter()
  const updatesPanelRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profileStatus, setProfileStatus] = useState<'pending' | 'active' | 'disabled' | null>(null)
  const [canUseDevDashboard, setCanUseDevDashboard] = useState(false)
  const [canUseScheduler, setCanUseScheduler] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [topTab, setTopTab] = useState<TopTab>(() => {
    if (typeof window === 'undefined') return 'progress'
    const stored = window.localStorage.getItem('azul-dashboard-tab')
    return stored === 'dev' ? 'dev' : 'progress'
  })

  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [selectedMilestone, setSelectedMilestone] = useState<number | null>(null)
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')

  const [tasks, setTasks] = useState<Task[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [newIssueType, setNewIssueType] = useState<'task' | 'bug'>('task')
  const [newIssueTitle, setNewIssueTitle] = useState('')
  const [newIssueStatus, setNewIssueStatus] = useState<Status>('todo')
  const [newIssueAssignee, setNewIssueAssignee] = useState('Unassigned')

  const [newUpdateTitle, setNewUpdateTitle] = useState('')
  const [newUpdateWhatChanged, setNewUpdateWhatChanged] = useState('')
  const [newUpdateNextSteps, setNewUpdateNextSteps] = useState('')
  const [newUpdateAssignee, setNewUpdateAssignee] = useState('Unassigned')
  const [newUpdateStatus, setNewUpdateStatus] = useState<Status>('todo')

  useEffect(() => {
    void checkUser()
  }, [])

  const checkUser = async () => {
    const {
      data: { user: authUser }
    } = await supabase.auth.getUser()

    if (!authUser) {
      router.push('/')
      return
    }

    setUser(authUser)

    const [profileRes, permissionRes, adminRes] = await Promise.all([
      supabase.from('profiles').select('status').eq('id', authUser.id).maybeSingle(),
      supabase.from('user_permissions').select('can_use_dev_dashboard, can_use_scheduler').eq('user_id', authUser.id).maybeSingle(),
      supabase.rpc('is_admin', { uid: authUser.id })
    ])

    const status = profileRes.data?.status || 'pending'
    setProfileStatus(status)
    setCanUseDevDashboard(Boolean(permissionRes.data?.can_use_dev_dashboard))
    setCanUseScheduler(Boolean(permissionRes.data?.can_use_scheduler))
    setIsAdmin(Boolean(adminRes.data))

    if (status === 'pending') {
      router.push('/pending')
      return
    }

    if (status === 'active' && permissionRes.data?.can_use_dev_dashboard) {
      await fetchData()
      return
    }

    setLoading(false)
  }

  const fetchData = async () => {
    setLoading(true)
    const [msRes, tasksRes, revsRes, profilesRes] = await Promise.all([
      supabase.from('milestones').select('id, title, created_at').order('created_at', { ascending: true }),
      supabase.from('tasks').select('id, milestone_id, title, description, status, priority, assignee, created_by, created_at, type').order('created_at', { ascending: false }),
      supabase.from('revisions').select('id, milestone_id, title, description, what_changed, next_steps, status, assignee, created_by, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, email, first_name, status')
    ])

    if (msRes.data) {
      setMilestones(msRes.data)
      if (msRes.data.length && !selectedMilestone) {
        setSelectedMilestone(msRes.data[0].id)
      }
    }
    if (tasksRes.data) {
      const normalized = tasksRes.data.map((t) => ({ ...t, type: (t.type === 'bug' ? 'bug' : 'task') as 'task' | 'bug' }))
      setTasks(normalized as Task[])
    }
    if (revsRes.data) setRevisions(revsRes.data as Revision[])
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])

    setLoading(false)
  }

  const activeProfiles = useMemo(() => {
    return profiles
      .filter((p) => p.status === 'active')
      .map((p) => ({
        value: p.first_name?.trim() || p.email || 'Unassigned',
        label: p.first_name?.trim() || p.email || 'Unassigned'
      }))
  }, [profiles])

  const assigneeOptions = useMemo(() => {
    const unique = new Map<string, string>()
    unique.set('Unassigned', 'Unassigned')
    for (const p of activeProfiles) unique.set(p.value, p.label)
    return Array.from(unique.entries()).map(([value, label]) => ({ value, label }))
  }, [activeProfiles])

  const milestoneTasks = useMemo(
    () => tasks.filter((t) => t.milestone_id === selectedMilestone),
    [tasks, selectedMilestone]
  )

  const milestoneRevisions = useMemo(
    () => revisions.filter((r) => r.milestone_id === selectedMilestone),
    [revisions, selectedMilestone]
  )

  const workflowItems = useMemo(() => {
    const taskItems = milestoneTasks.map((task) => ({
      id: `task-${task.id}`,
      kind: 'task' as const,
      createdAt: task.created_at || '',
      task
    }))

    const revisionItems = milestoneRevisions.map((revision) => ({
      id: `revision-${revision.id}`,
      kind: 'revision' as const,
      createdAt: revision.created_at || '',
      revision
    }))

    return [...taskItems, ...revisionItems].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime()
      const tb = new Date(b.createdAt || 0).getTime()
      return tb - ta
    })
  }, [milestoneTasks, milestoneRevisions])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const addMilestone = async () => {
    const title = newMilestoneTitle.trim()
    if (!title) return

    const { data } = await supabase.from('milestones').insert({ title }).select('id, title, created_at').single()
    if (!data) return

    setMilestones((prev) => [...prev, data])
    setSelectedMilestone(data.id)
    setNewMilestoneTitle('')
  }

  const addIssue = async () => {
    if (!selectedMilestone || !newIssueTitle.trim()) return

    const payload = {
      milestone_id: selectedMilestone,
      title: newIssueTitle.trim(),
      description: '',
      status: newIssueStatus,
      assignee: newIssueAssignee,
      created_by: user?.email || null,
      type: newIssueType
    }

    const { data } = await supabase
      .from('tasks')
      .insert(payload)
      .select('id, milestone_id, title, description, status, priority, assignee, created_by, created_at, type')
      .single()

    if (!data) return

    setTasks((prev) => [data as Task, ...prev])
    setNewIssueTitle('')
    setNewIssueStatus('todo')
  }

  const addUpdate = async () => {
    if (!selectedMilestone || !newUpdateTitle.trim()) return

    const payload = {
      milestone_id: selectedMilestone,
      title: newUpdateTitle.trim(),
      description: '',
      what_changed: newUpdateWhatChanged.trim(),
      next_steps: newUpdateNextSteps.trim(),
      status: newUpdateStatus,
      assignee: newUpdateAssignee,
      created_by: user?.email || null
    }

    const { data } = await supabase
      .from('revisions')
      .insert(payload)
      .select('id, milestone_id, title, description, what_changed, next_steps, status, assignee, created_by, created_at')
      .single()

    if (!data) return

    setRevisions((prev) => [data as Revision, ...prev])
    setNewUpdateTitle('')
    setNewUpdateWhatChanged('')
    setNewUpdateNextSteps('')
    setNewUpdateStatus('todo')
  }

  const setTaskLocal = (id: number, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const persistTask = async (id: number, patch: Partial<Task>) => {
    await supabase.from('tasks').update(patch).eq('id', id)
  }

  const setRevisionLocal = (id: number, patch: Partial<Revision>) => {
    setRevisions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const persistRevision = async (id: number, patch: Partial<Revision>) => {
    await supabase.from('revisions').update(patch).eq('id', id)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        Loading...
      </div>
    )
  }

  if (profileStatus !== 'active' || !canUseDevDashboard) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem', background: 'var(--bg)', color: 'var(--text)' }}>
        <div style={{ width: '100%', maxWidth: 560, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem' }}>
          <h1 style={{ marginTop: 0 }}>Limited Access</h1>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
            Your account does not have access to the development dashboard yet.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/settings')} style={btnSecondary}>Settings</button>
            {canUseScheduler && <button onClick={() => router.push('/dashboard/content')} style={btnPrimary}>Open Content Calendar</button>}
            {isAdmin && <button onClick={() => router.push('/admin')} style={btnInfo}>Open Admin Panel</button>}
            <button onClick={handleLogout} style={btnDanger}>Logout</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex' }}>
      <aside
        style={{
          width: sidebarCollapsed ? 84 : 240,
          transition: 'width .18s ease',
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {!sidebarCollapsed && <strong>Sapien Eleven</strong>}
          <button onClick={() => setSidebarCollapsed((v) => !v)} style={btnGhost}>
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        {canUseScheduler && (
          <button
            onClick={() => router.push('/dashboard/content')}
            style={{
              ...btnPrimary,
              boxShadow: '0 0 0 1px rgba(228, 58, 75, 0.32) inset'
            }}
          >
            {sidebarCollapsed ? 'CAL' : 'Calendar'}
          </button>
        )}
        <button onClick={() => router.push('/settings')} style={btnSecondary}>
          {sidebarCollapsed ? 'SET' : 'Settings'}
        </button>
        {isAdmin && (
          <button onClick={() => router.push('/admin')} style={btnInfo}>
            {sidebarCollapsed ? 'ADM' : 'Admin'}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={handleLogout} style={btnDanger}>
          {sidebarCollapsed ? 'OUT' : 'Logout'}
        </button>
      </aside>

      <main style={{ flex: 1, padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              window.localStorage.setItem('azul-dashboard-tab', 'progress')
              setTopTab('progress')
            }}
            style={topTab === 'progress' ? tabActive : tabIdle}
          >
            Progress
          </button>
          <button
            onClick={() => {
              window.localStorage.setItem('azul-dashboard-tab', 'dev')
              setTopTab('dev')
            }}
            style={topTab === 'dev' ? tabActive : tabIdle}
          >
            Dev/Coder
          </button>
        </div>

        {topTab === 'progress' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            <section style={panelStyle}>
              <div style={panelHeader}>
                <h3 style={{ margin: 0 }}>Milestones</h3>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addMilestone()
                  }}
                  placeholder="New milestone"
                  style={inputStyle}
                />
                <button onClick={() => void addMilestone()} style={btnPrimary}>Add</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {milestones.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMilestone(m.id)}
                    style={{
                      textAlign: 'left',
                      padding: '0.65rem 0.7rem',
                      borderRadius: 8,
                      border: `1px solid ${selectedMilestone === m.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: selectedMilestone === m.id ? 'var(--surface-2)' : 'var(--surface)',
                      color: 'var(--text)',
                      cursor: 'pointer'
                    }}
                  >
                    {m.title}
                  </button>
                ))}
                {!milestones.length && <p style={{ color: 'var(--muted)', margin: 0 }}>No milestones yet.</p>}
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <h3 style={{ margin: 0 }}>Issues</h3>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button onClick={() => setNewIssueType('task')} style={newIssueType === 'task' ? miniBtnActive : miniBtn}>Task</button>
                  <button onClick={() => setNewIssueType('bug')} style={newIssueType === 'bug' ? miniBtnActive : miniBtn}>Bug</button>
                  <button
                    onClick={() => updatesPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    style={miniBtn}
                  >
                    Update
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.9rem' }}>
                <input
                  value={newIssueTitle}
                  onChange={(e) => setNewIssueTitle(e.target.value)}
                  placeholder={`Quick add ${newIssueType}`}
                  style={inputStyle}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                  <select value={newIssueStatus} onChange={(e) => setNewIssueStatus(e.target.value as Status)} style={inputStyle}>
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select value={newIssueAssignee} onChange={(e) => setNewIssueAssignee(e.target.value)} style={inputStyle}>
                    {assigneeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button onClick={() => void addIssue()} style={btnPrimary}>Add</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 560, overflow: 'auto' }}>
                {workflowItems.map((item) => {
                  if (item.kind === 'task') {
                    const t = item.task
                    return (
                      <article key={item.id} style={cardStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
                          <span style={badge(t.type === 'bug' ? '#dc2626' : '#0ea5e9')}>{t.type.toUpperCase()}</span>
                          <span style={badge('#334155')}>{t.status.replace('_', ' ')}</span>
                        </div>
                        <input
                          value={t.title}
                          onChange={(e) => setTaskLocal(t.id, { title: e.target.value })}
                          onBlur={() => void persistTask(t.id, { title: t.title })}
                          style={{ ...inputStyle, marginBottom: '0.45rem' }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                          <select
                            value={t.status}
                            onChange={(e) => {
                              const status = e.target.value as Status
                              setTaskLocal(t.id, { status })
                              void persistTask(t.id, { status })
                            }}
                            style={inputStyle}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <select
                            value={t.assignee || 'Unassigned'}
                            onChange={(e) => {
                              const assignee = e.target.value
                              setTaskLocal(t.id, { assignee })
                              void persistTask(t.id, { assignee })
                            }}
                            style={inputStyle}
                          >
                            {assigneeOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </article>
                    )
                  }

                  const r = item.revision
                  return (
                    <article key={item.id} style={cardStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
                        <span style={badge('#a855f7')}>UPDATE</span>
                        <span style={badge('#334155')}>{r.status.replace('_', ' ')}</span>
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: '0.45rem' }}>{r.title}</div>
                      <p style={fieldLabel}>what_changed</p>
                      <p style={fieldValue}>{r.what_changed || r.description || 'No update notes yet.'}</p>
                      <p style={fieldLabel}>next_steps</p>
                      <p style={fieldValue}>{r.next_steps || 'No next steps yet.'}</p>
                    </article>
                  )
                })}
                {!workflowItems.length && <p style={{ color: 'var(--muted)', margin: 0 }}>No issues or updates for this milestone.</p>}
              </div>
            </section>

            <section style={panelStyle} ref={updatesPanelRef}>
              <div style={panelHeader}>
                <h3 style={{ margin: 0 }}>Updates</h3>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                <input value={newUpdateTitle} onChange={(e) => setNewUpdateTitle(e.target.value)} placeholder="title" style={inputStyle} />
                <textarea value={newUpdateWhatChanged} onChange={(e) => setNewUpdateWhatChanged(e.target.value)} placeholder="what_changed" style={textAreaStyle} />
                <textarea value={newUpdateNextSteps} onChange={(e) => setNewUpdateNextSteps(e.target.value)} placeholder="next_steps" style={textAreaStyle} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                  <select value={newUpdateStatus} onChange={(e) => setNewUpdateStatus(e.target.value as Status)} style={inputStyle}>
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select value={newUpdateAssignee} onChange={(e) => setNewUpdateAssignee(e.target.value)} style={inputStyle}>
                    {assigneeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button onClick={() => void addUpdate()} style={btnPrimary}>Add</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 520, overflow: 'auto' }}>
                {milestoneRevisions.map((r) => (
                  <article key={r.id} style={cardStyle}>
                    <input
                      value={r.title}
                      onChange={(e) => setRevisionLocal(r.id, { title: e.target.value })}
                      onBlur={() => void persistRevision(r.id, { title: r.title })}
                      style={{ ...inputStyle, fontWeight: 600, marginBottom: '0.45rem' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.45rem' }}>
                      <select
                        value={r.status}
                        onChange={(e) => {
                          const status = e.target.value as Status
                          setRevisionLocal(r.id, { status })
                          void persistRevision(r.id, { status })
                        }}
                        style={inputStyle}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <select
                        value={r.assignee || 'Unassigned'}
                        onChange={(e) => {
                          const assignee = e.target.value
                          setRevisionLocal(r.id, { assignee })
                          void persistRevision(r.id, { assignee })
                        }}
                        style={inputStyle}
                      >
                        {assigneeOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <p style={fieldLabel}>what_changed</p>
                    <textarea
                      value={r.what_changed || ''}
                      onChange={(e) => setRevisionLocal(r.id, { what_changed: e.target.value })}
                      onBlur={() => void persistRevision(r.id, { what_changed: r.what_changed || '' })}
                      style={{ ...textAreaStyle, minHeight: 62 }}
                    />
                    <p style={{ ...fieldLabel, marginTop: '0.4rem' }}>next_steps</p>
                    <textarea
                      value={r.next_steps || ''}
                      onChange={(e) => setRevisionLocal(r.id, { next_steps: e.target.value })}
                      onBlur={() => void persistRevision(r.id, { next_steps: r.next_steps || '' })}
                      style={{ ...textAreaStyle, minHeight: 62 }}
                    />
                  </article>
                ))}
                {!milestoneRevisions.length && <p style={{ color: 'var(--muted)', margin: 0 }}>No updates yet for this milestone.</p>}
              </div>
            </section>
          </div>
        )}

        {topTab === 'dev' && (
          <section style={{ ...panelStyle, maxWidth: 900 }}>
            <h3 style={{ marginTop: 0 }}>Dev/Coder</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '0.8rem' }}>
              Use Progress as the command center for issues and updates. This tab is reserved for coder-focused tools and can be extended without changing routes.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => setTopTab('progress')} style={btnPrimary}>Open Progress</button>
              <button onClick={() => router.push('/dashboard/content')} style={btnSecondary} disabled={!canUseScheduler}>
                Open Calendar
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '0.9rem'
}

const panelHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.75rem',
  gap: '0.5rem'
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '0.65rem'
}

const fieldLabel: React.CSSProperties = {
  margin: '0 0 0.2rem 0',
  color: 'var(--muted)',
  fontSize: '0.75rem'
}

const fieldValue: React.CSSProperties = {
  margin: '0 0 0.45rem 0',
  fontSize: '0.87rem'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  ...ui.input
}

const textAreaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 70
}

const tabIdle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer'
}

const tabActive: React.CSSProperties = {
  ...tabIdle,
  border: '1px solid var(--accent)',
  background: 'var(--surface-2)'
}

const btnGhost: React.CSSProperties = {
  ...ui.buttonGhost,
  padding: '0.45rem 0.6rem'
}

const btnPrimary: React.CSSProperties = {
  ...ui.buttonPrimary
}

const btnSecondary: React.CSSProperties = {
  ...ui.buttonSecondary
}

const btnDanger: React.CSSProperties = {
  ...ui.buttonDanger
}

const btnInfo: React.CSSProperties = {
  ...ui.buttonInfo
}

const miniBtn: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: '0.75rem',
  cursor: 'pointer'
}

const miniBtnActive: React.CSSProperties = {
  ...miniBtn,
  border: '1px solid var(--accent)'
}

const badge = (background: string): React.CSSProperties => ({
  background,
  color: '#f8fafc',
  fontSize: '0.67rem',
  lineHeight: 1,
  padding: '0.25rem 0.4rem',
  borderRadius: 6,
  textTransform: 'uppercase'
})
