'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { ui, withDisabled } from '../../../ui/styles'

type ProjectRow = {
  id: number
  title: string
  updated_at: string
}

type Project = {
  id: number
  title: string
  description: string | null
  repo_url: string | null
  default_branch: string
}

type Iteration = {
  id: number
  created_at: string
  instruction: string | null
  status: 'draft' | 'queued' | 'running' | 'done' | 'failed'
  assignee_user_id: string | null
}

type UserOption = { id: string; email: string | null; first_name: string | null }

export default function CockpitV2ProjectPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = Number(params?.projectId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [projects, setProjects] = useState<ProjectRow[]>([])

  const [project, setProject] = useState<Project | null>(null)
  const [iterations, setIterations] = useState<Iteration[]>([])
  const [users, setUsers] = useState<UserOption[]>([])

  const [instruction, setInstruction] = useState('')
  const [collabNotes, setCollabNotes] = useState('')
  const [assignee, setAssignee] = useState<string>('')

  useEffect(() => {
    void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

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

    const { data: hasDev, error: devErr } = await supabase.rpc('has_developer_access', { uid: user.id })
    if (devErr || !hasDev) {
      router.push('/dashboard')
      return
    }

    if (!Number.isInteger(projectId) || projectId <= 0) {
      router.push('/dashboard/cockpit-v2')
      return
    }

    await Promise.all([loadProjects(), loadProject(), loadIterations(), loadUsers()])
    setLoading(false)
  }

  const loadProjects = async () => {
    const { data, error: loadErr } = await supabase
      .from('cockpit_projects')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })

    if (loadErr) {
      setError(loadErr.message)
      return
    }

    setProjects((data || []) as ProjectRow[])
  }

  const loadProject = async () => {
    const { data, error: loadErr } = await supabase
      .from('cockpit_projects')
      .select('id, title, description, repo_url, default_branch')
      .eq('id', projectId)
      .maybeSingle()

    if (loadErr) {
      setError(loadErr.message)
      return
    }

    if (!data) {
      setError('Project not found (or you do not have access).')
      setProject(null)
      return
    }

    setProject(data as Project)
  }

  const loadIterations = async () => {
    const { data, error: loadErr } = await supabase
      .from('cockpit_project_iterations')
      .select('id, created_at, instruction, status, assignee_user_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (loadErr) {
      setError(loadErr.message)
      return
    }

    setIterations((data || []) as Iteration[])
  }

  const loadUsers = async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) return

    const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id })

    if (!isAdmin) {
      setUsers([{ id: user.id, email: user.email ?? null, first_name: (user.user_metadata as any)?.first_name ?? null }])
      setAssignee(user.id)
      return
    }

    const { data, error: err } = await supabase.from('profiles').select('id, email, first_name').eq('status', 'active')

    if (err) {
      setUsers([{ id: user.id, email: user.email ?? null, first_name: (user.user_metadata as any)?.first_name ?? null }])
      setAssignee(user.id)
      return
    }

    setUsers((data || []) as UserOption[])
    if (!assignee) setAssignee(user.id)
  }

  const canBuildFromThis = useMemo(() => instruction.trim().length > 0, [instruction])

  const createIteration = async () => {
    if (!canBuildFromThis) return

    setWorking(true)
    setError('')

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/')
      return
    }

    const { error: insErr } = await supabase.from('cockpit_project_iterations').insert([
      {
        project_id: projectId,
        created_by: user.id,
        instruction: instruction.trim(),
        collab_notes: collabNotes.trim() || null,
        assignee_user_id: assignee || null,
        status: 'draft'
      }
    ])

    if (insErr) {
      setError(insErr.message)
      setWorking(false)
      return
    }

    setInstruction('')
    setCollabNotes('')

    await loadIterations()
    setWorking(false)
  }

  if (loading) {
    return <div style={{ ...ui.page, display: 'grid', placeItems: 'center' }}>Loading Cockpit v2…</div>
  }

  return (
    <div style={{ ...ui.page, padding: 0, display: 'flex', height: '100vh' }}>
      {/* Projects sidebar (collapsible) */}
      <aside
        style={{
          width: sidebarCollapsed ? 64 : 300,
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '0.9rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontWeight: 900 }}>Projects</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Private by default</div>
            </div>
          )}
          <button onClick={() => setSidebarCollapsed((v) => !v)} style={ui.buttonGhost}>
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <button onClick={() => router.push('/dashboard/cockpit-v2')} style={ui.buttonSecondary}>+ New / Select</button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/dashboard/cockpit-v2/${p.id}`)}
                style={{
                  textAlign: 'left',
                  padding: '0.65rem 0.7rem',
                  borderRadius: 10,
                  border: `1px solid ${p.id === projectId ? 'var(--accent)' : 'var(--border)'}`,
                  background: p.id === projectId ? 'var(--surface-2)' : 'var(--surface)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 800 }}>{p.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {new Date(p.updated_at).toLocaleString()}
                </div>
              </button>
            ))}
            {projects.length === 0 && <div style={{ color: 'var(--muted)' }}>No projects yet.</div>}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {!sidebarCollapsed && (
          <button onClick={() => router.push('/dashboard')} style={ui.buttonSecondary}>
            Back to Dashboard
          </button>
        )}
      </aside>

      {/* 3-column cockpit layout */}
      <main style={{ flex: 1, padding: '0.9rem' }}>
        {error && (
          <div style={{ marginBottom: '0.75rem', background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: '8px', padding: '0.75rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '0.9rem' }}>
          {/* Output */}
          <section style={{ ...ui.panel, padding: '0.9rem', minHeight: '72vh' }}>
            <div style={{ fontWeight: 900, marginBottom: '0.5rem' }}>Output</div>
            <div style={{ color: 'var(--muted)', marginBottom: '0.75rem' }}>Project: {project?.title || projectId}</div>

            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {iterations.map((it) => (
                <div key={it.id} style={{ ...ui.panelAlt, padding: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 800 }}>Iteration #{it.id}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{it.status}</div>
                  </div>
                  {it.instruction ? (
                    <div style={{ marginTop: '0.35rem', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{it.instruction}</div>
                  ) : null}
                  <div style={{ marginTop: '0.35rem', color: 'var(--muted)', fontSize: '0.8rem' }}>{new Date(it.created_at).toLocaleString()}</div>
                </div>
              ))}
              {iterations.length === 0 && <div style={{ color: 'var(--muted)' }}>No iterations yet.</div>}
            </div>
          </section>

          {/* File viewer */}
          <section style={{ ...ui.panel, padding: '0.9rem', minHeight: '72vh' }}>
            <div style={{ fontWeight: 900, marginBottom: '0.5rem' }}>File Viewer</div>
            <div style={{ color: 'var(--muted)' }}>
              Next: upload images/builder export/code files and mark up images with highlight.
            </div>
          </section>

          {/* Inputs */}
          <section style={{ ...ui.panel, padding: '0.9rem', minHeight: '72vh' }}>
            <div style={{ fontWeight: 900, marginBottom: '0.5rem' }}>Describe what you want to build (or show me)</div>

            <div style={{ display: 'grid', gap: '0.65rem' }}>
              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Assignment</div>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={ui.input}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name || u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Build description</div>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Describe what to build/fix in plain English…"
                  style={{ ...ui.input, minHeight: 140, resize: 'vertical' }}
                />
              </div>

              <div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Collab notes</div>
                <textarea
                  value={collabNotes}
                  onChange={(e) => setCollabNotes(e.target.value)}
                  placeholder="Notes for dev collaboration / review"
                  style={{ ...ui.input, minHeight: 90, resize: 'vertical' }}
                />
              </div>

              <button
                disabled={working || !canBuildFromThis}
                onClick={() => void createIteration()}
                style={withDisabled(ui.buttonInfo, working || !canBuildFromThis)}
              >
                Build from this
              </button>

              <button disabled style={withDisabled(ui.buttonSecondary, true)}>
                Ship it (Create PR) — coming next
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
