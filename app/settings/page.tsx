'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

type ApiKeyRecord = {
  id: number
  name: string | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

type AccountState = {
  id: string
  email: string
  status: 'pending' | 'active' | 'disabled'
  canUseDevDashboard: boolean
  canUseScheduler: boolean
}

const fmt = (value: string | null) => (value ? new Date(value).toLocaleString() : 'Never')

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<AccountState | null>(null)
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  const [keyName, setKeyName] = useState('')
  const [keysBusy, setKeysBusy] = useState(false)
  const [newPlainKey, setNewPlainKey] = useState('')

  useEffect(() => {
    void initialize()
  }, [])

  const getToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData.session?.access_token || ''
  }

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

    const [profileRes, permissionRes] = await Promise.all([
      supabase.from('profiles').select('status').eq('id', user.id).maybeSingle(),
      supabase.from('user_permissions').select('can_use_dev_dashboard, can_use_scheduler').eq('user_id', user.id).maybeSingle()
    ])

    if (profileRes.error || permissionRes.error || !profileRes.data) {
      setError(profileRes.error?.message || permissionRes.error?.message || 'Failed to load account settings')
      setLoading(false)
      return
    }

    setAccount({
      id: user.id,
      email: user.email || '',
      status: profileRes.data.status,
      canUseDevDashboard: Boolean(permissionRes.data?.can_use_dev_dashboard),
      canUseScheduler: Boolean(permissionRes.data?.can_use_scheduler)
    })

    await fetchKeys()
    setLoading(false)
  }

  const fetchKeys = async () => {
    const token = await getToken()
    if (!token) return

    const res = await fetch('/api/keys/list', {
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Failed to fetch API keys')
      return
    }

    setKeys(data?.keys || [])
  }

  const changePassword = async () => {
    if (!newPassword) {
      setError('Enter a new password')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Password confirmation does not match')
      return
    }

    setPasswordBusy(true)
    setError('')
    setMessage('')

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
    }

    setPasswordBusy(false)
  }

  const sendReset = async () => {
    if (!account?.email) return

    setResetBusy(true)
    setError('')
    setMessage('')

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(account.email, {
      redirectTo: `${window.location.origin}/`
    })

    if (resetError) {
      setError(resetError.message)
    } else {
      setMessage('Reset password email sent')
    }

    setResetBusy(false)
  }

  const createKey = async () => {
    const token = await getToken()
    if (!token) {
      setError('Session expired. Please sign in again.')
      return
    }

    setKeysBusy(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/keys/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: keyName })
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Failed to create API key')
      setKeysBusy(false)
      return
    }

    setNewPlainKey(data.key || '')
    setKeyName('')
    setMessage('API key created. Copy it now; it will not be shown again.')
    await fetchKeys()
    setKeysBusy(false)
  }

  const revokeKey = async (id: number) => {
    const token = await getToken()
    if (!token) {
      setError('Session expired. Please sign in again.')
      return
    }

    setKeysBusy(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/keys/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ id })
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Failed to revoke API key')
      setKeysBusy(false)
      return
    }

    setMessage('API key revoked')
    await fetchKeys()
    setKeysBusy(false)
  }

  const deleteKey = async (id: number) => {
    const token = await getToken()
    if (!token) {
      setError('Session expired. Please sign in again.')
      return
    }

    const ok = confirm('Delete this API key? This cannot be undone. (Tip: revoke first.)')
    if (!ok) return

    setKeysBusy(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/keys/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ id })
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Failed to delete API key')
      setKeysBusy(false)
      return
    }

    setMessage('API key deleted')
    await fetchKeys()
    setKeysBusy(false)
  }

  const botEndpoints = useMemo(() => {
    if (typeof window === 'undefined') return []
    const base = window.location.origin
    return [`${base}/api/openclaw/content-items`, `${base}/api/openclaw/revisions`]
  }, [])

  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#000', color: '#fff', display: 'grid', placeItems: 'center' }}>Loading settings...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', padding: '1.25rem' }}>
      <div style={{ maxWidth: '920px', margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Settings</h1>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 12px', background: '#333', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>
            Back to dashboard
          </button>
        </div>

        {error && <div style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: '8px', padding: '0.75rem' }}>{error}</div>}
        {message && <div style={{ background: '#064e3b', border: '1px solid #10b981', borderRadius: '8px', padding: '0.75rem' }}>{message}</div>}

        <section style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Account</h2>
          <div style={{ color: '#aaa', display: 'grid', gap: '0.4rem' }}>
            <div><strong style={{ color: '#fff' }}>Email:</strong> {account?.email || 'Unknown'}</div>
            <div><strong style={{ color: '#fff' }}>Status:</strong> {account?.status || 'unknown'}</div>
            <div><strong style={{ color: '#fff' }}>can_use_dev_dashboard:</strong> {String(account?.canUseDevDashboard)}</div>
            <div><strong style={{ color: '#fff' }}>can_use_scheduler:</strong> {String(account?.canUseScheduler)}</div>
          </div>
        </section>

        <section style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Change password</h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              style={{ padding: '0.55rem', borderRadius: '6px', border: '1px solid #333', background: '#000', color: '#fff' }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={{ padding: '0.55rem', borderRadius: '6px', border: '1px solid #333', background: '#000', color: '#fff' }}
            />
            <button onClick={changePassword} disabled={passwordBusy} style={{ padding: '8px 12px', border: 'none', borderRadius: '6px', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: passwordBusy ? 0.6 : 1 }}>
              {passwordBusy ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </section>

        <section style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Reset password email</h2>
          <p style={{ color: '#aaa' }}>Send a reset email to your current address ({account?.email || 'unknown'}).</p>
          <button onClick={sendReset} disabled={resetBusy} style={{ padding: '8px 12px', border: 'none', borderRadius: '6px', background: '#2563eb', color: '#fff', cursor: 'pointer', opacity: resetBusy ? 0.6 : 1 }}>
            {resetBusy ? 'Sending...' : 'Send reset email'}
          </button>
        </section>

        <section style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>OpenClaw API keys</h2>
          <div style={{ color: '#aaa', marginBottom: '0.75rem' }}>
            Use these with `Authorization: Bearer {'<your_api_key>'}`.
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key name (optional)"
              style={{ flex: 1, minWidth: '220px', padding: '0.55rem', borderRadius: '6px', border: '1px solid #333', background: '#000', color: '#fff' }}
            />
            <button onClick={createKey} disabled={keysBusy} style={{ padding: '8px 12px', border: 'none', borderRadius: '6px', background: '#10b981', color: '#fff', cursor: 'pointer', opacity: keysBusy ? 0.6 : 1 }}>
              {keysBusy ? 'Working...' : 'Create key'}
            </button>
          </div>

          {newPlainKey && (
            <div style={{ background: '#0a0a0a', border: '1px solid #334155', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>New key (shown once):</div>
              <code style={{ display: 'block', wordBreak: 'break-all', color: '#93c5fd' }}>{newPlainKey}</code>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(newPlainKey)
                    setMessage('API key copied to clipboard')
                  }}
                  style={{ padding: '6px 10px', border: 'none', borderRadius: '6px', background: '#475569', color: '#fff', cursor: 'pointer' }}
                >
                  Copy
                </button>
                <button
                  onClick={() => setNewPlainKey('')}
                  style={{ padding: '6px 10px', border: 'none', borderRadius: '6px', background: '#333', color: '#fff', cursor: 'pointer' }}
                >
                  Hide
                </button>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#aaa' }}>
                  <th style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>Name</th>
                  <th style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>Created</th>
                  <th style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>Last used</th>
                  <th style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>Revoked</th>
                  <th style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '0.75rem', color: '#666' }}>No API keys yet.</td>
                  </tr>
                )}
                {keys.map((row) => (
                  <tr key={row.id}>
                    <td style={{ borderBottom: '1px solid #222', padding: '0.5rem' }}>{row.name || `Key #${row.id}`}</td>
                    <td style={{ borderBottom: '1px solid #222', padding: '0.5rem' }}>{fmt(row.created_at)}</td>
                    <td style={{ borderBottom: '1px solid #222', padding: '0.5rem' }}>{fmt(row.last_used_at)}</td>
                    <td style={{ borderBottom: '1px solid #222', padding: '0.5rem' }}>{row.revoked_at ? fmt(row.revoked_at) : 'Active'}</td>
                    <td style={{ borderBottom: '1px solid #222', padding: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          disabled={Boolean(row.revoked_at) || keysBusy}
                          onClick={() => revokeKey(row.id)}
                          style={{ padding: '6px 10px', border: 'none', borderRadius: '6px', background: row.revoked_at ? '#222' : '#dc2626', color: '#fff', cursor: row.revoked_at ? 'default' : 'pointer', opacity: keysBusy ? 0.6 : 1 }}
                        >
                          Revoke
                        </button>
                        <button
                          disabled={keysBusy}
                          onClick={() => deleteKey(row.id)}
                          style={{ padding: '6px 10px', border: 'none', borderRadius: '6px', background: '#333', color: '#fff', cursor: 'pointer', opacity: keysBusy ? 0.6 : 1 }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>OpenClaw bot endpoints</h2>
          <div style={{ color: '#aaa', display: 'grid', gap: '0.5rem' }}>
            {botEndpoints.map((url) => (
              <code key={url} style={{ background: '#000', border: '1px solid #222', padding: '0.5rem', borderRadius: '6px', color: '#93c5fd' }}>{url}</code>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
