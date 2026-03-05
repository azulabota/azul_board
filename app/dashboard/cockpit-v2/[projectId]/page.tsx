'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { ui, withDisabled } from '../../../ui/styles'

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
  title: string | null
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

    await Promise.all([loadProject(), loadIterations(), loadUsers()])
    setLoading(false)
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
      .select('id, created_at, title, instruction, status, assignee_user_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (loadErr) {
      setError(loadErr.message)
      return
    }

    setIterations((data || []) as Iteration[])
  }

  const loadUsers = async () => {
    // This is safe because profiles_select_own_or_admin blocks other users.
    // For assignee selection, we should use an admin API later.
    // MVP: we use an admin-only view if the current user is admin; otherwise show only self.
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
      // fall back to self
      setUsers([{ id: user.id, email: user.email ?? null, first_name: (user.user_metadata as any)?.first_name ?? null }])
      setAssignee(user.id)
      return
    }

    setUsers((data || []) as UserOption[])
    if (!assignee) setAssignee(user.id)
  }

  const canCreateIteration = useMemo(() => instruction.trim().length > 0, [instruction])

  const createIteration = async () => {
    if (!canCreateIteration) return

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
    return <div style={{ ...ui.page, display: 'grid', placeItems: 'center' }}>Loading project...</div>
  }

  return (
    <div style={{ ...ui.page, padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{project?.title || 'Project'}</h1>
          {project?.description ? <div style={{ color: 'var(--muted)', marginTop: '0.25rem' }}>{project.description}</div> : null}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => router.push('/dashboard/cockpit-v2')} style={ui.buttonSecondary}>Projects</button>
          <button onClick={() => router.push('/dashboard')} style={ui.buttonSecondary}>Dashboard</button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: '8px', padding: '0.75rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <section style={{ ...ui.panel, padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>New iteration</h2>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Assignee</div>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={ui.input}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name || u.email || u.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>What to build / fix</div>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe what to build/fix (this becomes the generation prompt)"
                style={{ ...ui.input, minHeight: 110, resize: 'vertical' }}
              />
            </div>

            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Collab notes</div>
              <textarea
                value={collabNotes}
                onChange={(e) => setCollabNotes(e.target.value)}
                placeholder="Notes for dev collaboration / review"
                style={{ ...ui.input, minHeight: 90, resize: 'vertical' }}
              />
            </div>

            <div>
              <button
                disabled={working || !canCreateIteration}
                onClick={() => void createIteration()}
                style={withDisabled(ui.buttonInfo, working || !canCreateIteration)}
              >
                Create iteration
              </button>
            </div>
          </div>
        </section>

        <section style={{ ...ui.panel, padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Iterations</h2>
          {iterations.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No iterations yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {iterations.map((it) => (
                <div key={it.id} style={{ ...ui.panelAlt, padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ fontWeight: 700 }}>Iteration #{it.id}</div>
                    <div style={{ color: 'var(--muted)' }}>{it.status}</div>
                  </div>
                  {it.instruction ? <div style={{ marginTop: '0.4rem', whiteSpace: 'pre-wrap' }}>{it.instruction}</div> : null}
                  <div style={{ marginTop: '0.4rem', color: 'var(--muted)', fontSize: '0.85rem' }}>{new Date(it.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section style={{ ...ui.panel, padding: '1rem', marginTop: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Workspace (coming next)</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
          Next up: 3-panel workspace (Output | File viewer + highlight | Context inputs) + repo allowlist + PR creation.
        </p>
      </section>
    </div>
  )
}
