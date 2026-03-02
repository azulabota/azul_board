import type React from 'react'

const buttonBase: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  border: '1px solid transparent',
  color: 'var(--text)',
  cursor: 'pointer',
  transition: 'background-color 120ms ease, border-color 120ms ease, opacity 120ms ease'
}

export const ui = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)'
  } as React.CSSProperties,
  panel: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12
  } as React.CSSProperties,
  panelAlt: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 10
  } as React.CSSProperties,
  input: {
    width: '100%',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '0.52rem 0.6rem'
  } as React.CSSProperties,
  buttonPrimary: {
    ...buttonBase,
    background: 'var(--primary)',
    border: '1px solid var(--primary-border)',
    color: '#fff5f5'
  } as React.CSSProperties,
  buttonSecondary: {
    ...buttonBase,
    background: 'var(--button-neutral)',
    border: '1px solid var(--border)',
    color: 'var(--text)'
  } as React.CSSProperties,
  buttonDanger: {
    ...buttonBase,
    background: 'var(--danger)',
    border: '1px solid var(--danger-border)',
    color: '#fff5f5'
  } as React.CSSProperties,
  buttonSuccess: {
    ...buttonBase,
    background: 'var(--success)',
    border: '1px solid var(--success-border)',
    color: '#f0fdf4'
  } as React.CSSProperties,
  buttonInfo: {
    ...buttonBase,
    background: 'var(--info)',
    border: '1px solid var(--info-border)',
    color: '#eff6ff'
  } as React.CSSProperties,
  buttonGhost: {
    ...buttonBase,
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text)'
  } as React.CSSProperties,
  mutedText: {
    color: 'var(--muted)'
  } as React.CSSProperties
}

export const withDisabled = (style: React.CSSProperties, disabled: boolean): React.CSSProperties => ({
  ...style,
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? 'not-allowed' : 'pointer'
})
