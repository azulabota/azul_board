'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { ui, withDisabled } from '../ui/styles'

type AdminUser = {
  id: string
  email: string | null
  first_name: string | null
  status: 'pending' | 'active' | 'disabled'
  can_use_dev_dashboard: boolean
  can_use_scheduler: boolean
  roles: string[]
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState('')

  const pendingUsers = useMemo(() => users.filter((u) => u.status === 'pending'), [users])

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

    const { data: isAdmin, error: isAdminError } = await supabase.rpc('is_admin', { uid: user.id })
    if (isAdminError || !isAdmin) {
      router.push('/dashboard')
      return
    }

    await loadUsers()
    setLoading(false)
  }

  const getAuthHeader = async () => {
    const {
      data: { session }
    } = await supabase.auth.getSession()
    const headers: Record<string, string> = {}
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }
    return headers
  }

  const loadUsers = async () => {
    const headers = await getAuthHeader()
    const res = await fetch('/api/admin/users', { headers })
    const body = await res.json()

    if (!res.ok) {
      setError(body.error || 'Failed to load users')
      return
    }

    setUsers(body.users || [])
  }

  const mutate = async (endpoint: string, payload: Record<string, unknown>, key: string) => {
    setWorking(key)
    setError('')

    const headers = await getAuthHeader()
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const body = await res.json()
    if (!res.ok) {
      setError(body.error || 'Action failed')
      setWorking(null)
      return
    }

    await loadUsers()
    setWorking(null)
  }

  if (loading) {
    return <div style={{ ...ui.page, display: 'grid', placeItems: 'center' }}>Loading admin panel...</div>
  }

  return (
    <div style={{ ...ui.page, padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Admin Panel</h1>
        <button onClick={() => router.push('/dashboard')} style={ui.buttonSecondary}>Back to Dashboard</button>
      </div>

      {error && <div style={{ marginBottom: '1rem', background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: '8px', padding: '0.75rem' }}>{error}</div>}

      <section style={{ ...ui.panel, marginBottom: '1.5rem', padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Pending users</h2>
        {pendingUsers.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No pending users.</p>
        ) : (
          pendingUsers.map((user) => (
            <div key={user.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{user.first_name || 'Unnamed user'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{user.email || 'No email'}</div>
              </div>
              <button
                disabled={working === `approve-${user.id}`}
                onClick={() => mutate('/api/admin/approve', { userId: user.id, status: 'active' }, `approve-${user.id}`)}
                style={withDisabled(ui.buttonSuccess, working === `approve-${user.id}`)}
              >
                Approve
              </button>
              <button
                disabled={working === `disable-pending-${user.id}`}
                onClick={() => mutate('/api/admin/approve', { userId: user.id, status: 'disabled' }, `disable-pending-${user.id}`)}
                style={withDisabled(ui.buttonDanger, working === `disable-pending-${user.id}`)}
              >
                Disable
              </button>
            </div>
          ))
        )}
      </section>

      <section style={{ ...ui.panel, marginBottom: '1.5rem', padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Users and permissions</h2>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {users.map((user) => (
            <div key={`perm-${user.id}`} style={{ ...ui.panelAlt, padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{user.first_name || 'Unnamed user'}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{user.email || 'No email'}</div>
                </div>
                <select
                  value={user.status}
                  onChange={(e) => mutate('/api/admin/approve', { userId: user.id, status: e.target.value }, `status-${user.id}`)}
                  style={{ ...ui.input, width: 140 }}
                >
                  <option value="pending">pending</option>
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
                <input
                  type="checkbox"
                  checked={user.can_use_dev_dashboard}
                  onChange={(e) => mutate('/api/admin/permissions', { userId: user.id, can_use_dev_dashboard: e.target.checked }, `dev-${user.id}`)}
                />
                <span>Dev dashboard access</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={user.can_use_scheduler}
                  onChange={(e) => mutate('/api/admin/permissions', { userId: user.id, can_use_scheduler: e.target.checked }, `sched-${user.id}`)}
                />
                <span>Scheduler access</span>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...ui.panel, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Admin role management</h2>
        {users.map((user) => {
          const isAdmin = user.roles.includes('admin')
          return (
            <div key={`role-${user.id}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{user.first_name || user.email || 'Unknown user'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Roles: {user.roles.length ? user.roles.join(', ') : 'none'}</div>
              </div>
              {isAdmin ? (
                <button
                  disabled={working === `demote-${user.id}`}
                  onClick={() => mutate('/api/admin/roles', { userId: user.id, action: 'demote' }, `demote-${user.id}`)}
                  style={withDisabled(ui.buttonDanger, working === `demote-${user.id}`)}
                >
                  Demote admin
                </button>
              ) : (
                <button
                  disabled={working === `promote-${user.id}`}
                  onClick={() => mutate('/api/admin/roles', { userId: user.id, action: 'promote' }, `promote-${user.id}`)}
                  style={withDisabled(ui.buttonInfo, working === `promote-${user.id}`)}
                >
                  Promote admin
                </button>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
