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

export default function CockpitV2ShellPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // New project form (right panel when no project selected)
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
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/dashboard/cockpit-v2/${p.id}`)}
                style={{
                  textAlign: 'left',
                  padding: '0.65rem 0.7rem',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
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
            <div style={{ color: 'var(--muted)' }}>Select a project to see code, files, and logs.</div>
          </section>

          {/* File viewer */}
          <section style={{ ...ui.panel, padding: '0.9rem', minHeight: '72vh' }}>
            <div style={{ fontWeight: 900, marginBottom: '0.5rem' }}>File Viewer</div>
            <div style={{ color: 'var(--muted)' }}>
              Upload images / builder export / code files inside a project. Highlighting comes next.
            </div>
          </section>

          {/* Inputs */}
          <section style={{ ...ui.panel, padding: '0.9rem', minHeight: '72vh' }}>
            <div style={{ fontWeight: 900, marginBottom: '0.5rem' }}>Describe what you want to build (or show me)</div>
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="New project name"
                style={ui.input}
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Project description (optional)"
                style={{ ...ui.input, minHeight: 90, resize: 'vertical' }}
              />
              <button
                disabled={working || !canCreate}
                onClick={() => void createProject()}
                style={withDisabled(ui.buttonInfo, working || !canCreate)}
              >
                Build from this (Create project)
              </button>
            </div>

            {!sidebarCollapsed && projects.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>Need to delete a project?</div>
                {projects.slice(0, 3).map((p) => (
                  <div key={`del-${p.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <div style={{ fontSize: '0.9rem' }}>{p.title}</div>
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
      </main>
    </div>
  )
}
