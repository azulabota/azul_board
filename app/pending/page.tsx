'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function PendingPage() {
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000', color: '#fff', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: '520px', background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '1.5rem' }}>
        <h1 style={{ marginTop: 0 }}>Waiting for approval</h1>
        <p style={{ color: '#aaa', lineHeight: 1.5 }}>
          Your account is pending admin approval. You will get access once an admin activates your profile.
        </p>
        <button
          onClick={handleSignOut}
          style={{ marginTop: '0.75rem', padding: '10px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
