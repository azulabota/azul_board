'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { ui, withDisabled } from './ui/styles'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('signin')
  const isSignUp = mode === 'signup'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const headline = useMemo(() => (isSignUp ? 'Request access' : 'Welcome back'), [isSignUp])
  const subhead = useMemo(
    () => (isSignUp ? 'Create your account. Approval is required before you can use the dashboard.' : 'Sign in to continue.'),
    [isSignUp]
  )

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { first_name: firstName.trim() }
          }
        })
        if (signUpError) throw signUpError

        setInfo('Check your email for the confirmation link. After confirmation, your account will be pending admin approval.')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
        router.push('/dashboard')
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell" style={{ ...ui.page, display: 'grid', placeItems: 'center', padding: '1.25rem' }}>
      <div className="auth-grid" />

      <div
        style={{
          width: 'min(980px, 100%)',
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: '1rem'
        }}
      >
        <section
          style={{
            ...ui.panel,
            padding: '1.4rem',
            minHeight: 420,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', letterSpacing: 0.6 }}>SAPIEN ELEVEN</div>
            <h1 style={{ margin: '0.35rem 0 0.5rem 0', fontSize: '2rem', lineHeight: 1.1 }}>{headline}</h1>
            <p style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--muted)' }}>{subhead}</p>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button
                onClick={() => {
                  setMode('signin')
                  setError('')
                  setInfo('')
                }}
                style={mode === 'signin' ? ui.buttonPrimary : ui.buttonSecondary}
                type="button"
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  setMode('signup')
                  setError('')
                  setInfo('')
                }}
                style={mode === 'signup' ? ui.buttonPrimary : ui.buttonSecondary}
                type="button"
              >
                Sign up
              </button>
            </div>

            {error && (
              <div style={{ background: '#4f1d28', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '0.75rem', marginBottom: '0.75rem' }}>
                {error}
              </div>
            )}

            {info && (
              <div style={{ background: '#0d3d31', border: '1px solid var(--success-border)', borderRadius: 10, padding: '0.75rem', marginBottom: '0.75rem' }}>
                {info}
              </div>
            )}

            <form onSubmit={handleAuth} style={{ display: 'grid', gap: '0.6rem' }}>
              {isSignUp && (
                <input
                  style={ui.input}
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              )}

              <input
                style={ui.input}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <input
                style={ui.input}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="submit"
                disabled={loading}
                style={withDisabled({ ...ui.buttonPrimary, width: '100%', padding: '0.65rem 0.9rem' }, loading)}
              >
                {loading ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}
              </button>

              <div style={{ color: 'var(--muted)', fontSize: '0.82rem', lineHeight: 1.35 }}>
                {isSignUp ? (
                  <span>
                    After signup, you’ll confirm your email. Then an admin must approve your account.
                  </span>
                ) : (
                  <span>
                    Trouble signing in? Use the password reset from <a href="/settings" style={{ color: 'var(--accent)' }}>Settings</a> after you’re logged in.
                  </span>
                )}
              </div>
            </form>
          </div>
        </section>

        <aside style={{ ...ui.panel, padding: '1.1rem', minHeight: 420 }}>
          <div style={{ fontWeight: 800, marginBottom: '0.5rem' }}>What this is</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.45 }}>
            <ul style={{ marginTop: 0, paddingLeft: '1.1rem' }}>
              <li>Progress dashboard (milestones / tasks / updates)</li>
              <li>Content calendar (per-user pipelines)</li>
              <li>Coding Cockpit (uploads + highlights + bot connection)</li>
            </ul>
            <div style={{ ...ui.panelAlt, padding: '0.75rem', marginTop: '0.75rem' }}>
              <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>Security</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Accounts are admin-approved. Data is isolated per user where required.
              </div>
            </div>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .auth-shell {
          position: relative;
        }
        .auth-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.85;
          background-image:
            radial-gradient(900px 520px at 12% -8%, rgba(228, 58, 75, 0.18), transparent 60%),
            radial-gradient(900px 520px at 92% 0%, rgba(34, 84, 170, 0.18), transparent 55%),
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: auto, auto, 28px 28px, 28px 28px;
          animation: grid-pan 18s linear infinite;
          mask-image: radial-gradient(circle at 50% 35%, rgba(0, 0, 0, 1) 40%, rgba(0, 0, 0, 0) 78%);
        }
        @keyframes grid-pan {
          from {
            background-position: 0 0, 0 0, 0 0, 0 0;
          }
          to {
            background-position: 0 0, 0 0, 220px 140px, 220px 140px;
          }
        }

        @media (max-width: 860px) {
          .auth-shell > div {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
