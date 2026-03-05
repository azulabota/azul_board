'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { ui, withDisabled } from '../../ui/styles'

type ProjectRow = {
  id: number
  title: string
  description: string | null
  repo_url: string | null
  updated_at: string
}

export default function CockpitV2ProjectsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState<ProjectRow[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

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

    const { data: hasDev, error: devErr } = await supabase.rpc('has_developer_access', { uid: user.id })
    if (devErr || !hasDev) {
      router.push('/dashboard')
      return
    }

    await loadProjects()
    setLoading(false)
  }

  const loadProjects = async () => {
    setError('')

    const { data, error: loadErr } = await supabase
      .from('cockpit_projects')
      .select('id, title, description, repo_url, updated_at')
      .order('updated_at', { ascending: false })

    if (loadErr) {
      setError(loadErr.message)
      return
    }

    setProjects((data || []) as ProjectRow[])
  }

  const canCreate = useMemo(() => title.trim().length > 0, [title])

  const createProject = async () => {
    if (!canCreate) return
    setWorking(true)
    setError('')

    const {
      data: { user }
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
      return
    }

    const { data: insertRows, error: insertErr } = await supabase
      .from('cockpit_projects')
      .insert([
        {
          owner_id: user.id,
          title: title.trim(),
          description: description.trim() || null
        }
      ])
      .select('id')
      .limit(1)

    if (insertErr) {
      setError(insertErr.message)
      setWorking(false)
      return
    }

    const projectId = insertRows?.[0]?.id
    setTitle('')
    setDescription('')

    await loadProjects()
    setWorking(false)

    if (projectId) {
      router.push(`/dashboard/cockpit-v2/${projectId}`)
    }
  }

  const softDeleteProject = async (projectId: number) => {
    setWorking(true)
    setError('')

    const deleteAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error: updErr } = await supabase
      .from('cockpit_projects')
      .update({ deleted_at: new Date().toISOString(), delete_after: deleteAfter })
      .eq('id', projectId)

    if (updErr) {
      setError(updErr.message)
      setWorking(false)
      return
    }

    await loadProjects()
    setWorking(false)
  }

  if (loading) {
    return <div style={{ ...ui.page, display: 'grid', placeItems: 'center' }}>Loading projects...</div>
  }

  return (
    <div style={{ ...ui.page, padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Coding Cockpit v2</h1>
          <div style={{ color: 'var(--muted)', marginTop: '0.25rem' }}>Projects (private by default)</div>
        </div>
        <button onClick={() => router.push('/dashboard')} style={ui.buttonSecondary}>Back</button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: '8px', padding: '0.75rem' }}>
          {error}
        </div>
      )}

      <section style={{ ...ui.panel, padding: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Create a new project</h2>
        <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 720 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Project name"
            style={ui.input}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            style={{ ...ui.input, minHeight: 90, resize: 'vertical' }}
          />
          <div>
            <button
              disabled={working || !canCreate}
              onClick={() => void createProject()}
              style={withDisabled(ui.buttonInfo, working || !canCreate)}
            >
              Create project
            </button>
          </div>
        </div>
      </section>

      <section style={{ ...ui.panel, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Your projects</h2>
        {projects.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No projects yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {projects.map((p) => (
              <div key={p.id} style={{ ...ui.panelAlt, padding: '0.9rem', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.75rem', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.title}</div>
                  {p.description ? <div style={{ color: 'var(--muted)', marginTop: '0.25rem' }}>{p.description}</div> : null}
                  <div style={{ color: 'var(--muted)', marginTop: '0.25rem', fontSize: '0.85rem' }}>Updated: {new Date(p.updated_at).toLocaleString()}</div>
                </div>
                <button
                  disabled={working}
                  onClick={() => router.push(`/dashboard/cockpit-v2/${p.id}`)}
                  style={withDisabled(ui.buttonSuccess, working)}
                >
                  Open
                </button>
                <button
                  disabled={working}
                  onClick={() => {
                    if (confirm('Soft-delete this project? It will be retained for 30 days.')) {
                      void softDeleteProject(p.id)
                    }
                  }}
                  style={withDisabled(ui.buttonDanger, working)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
