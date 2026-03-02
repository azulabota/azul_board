'use client'

import { useEffect, useState } from 'react'

type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'azul-theme'

const applyTheme = (theme: ThemeMode) => {
  const isLight = theme === 'light'
  document.documentElement.classList.toggle('theme-light', isLight)
  document.body.classList.toggle('theme-light', isLight)
}

export default function ThemeToggle({ style }: { style?: React.CSSProperties }) {
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const initial: ThemeMode = stored === 'light' ? 'light' : 'dark'
    setTheme(initial)
    applyTheme(initial)
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
  }

  if (!mounted) return null

  return (
    <button
      onClick={toggleTheme}
      style={{
        borderRadius: 999,
        border: '1px solid var(--border)',
        padding: '0.4rem 0.7rem',
        background: 'var(--surface-2)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontSize: '0.8rem',
        width: '100%',
        ...style
      }}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {theme === 'dark' ? 'Dim Light' : 'Dark'}
    </button>
  )
}
