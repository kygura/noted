import { useEffect, useRef } from 'react'

interface QueryBarProps {
  query: string
  loading: boolean
  gathering: boolean
  canGather: boolean
  onChange: (v: string) => void
  onClear: () => void
  onToggleGather: () => void
  onFit: () => void
}

export function QueryBar({
  query, loading, gathering, canGather, onChange, onClear, onToggleGather, onFit,
}: QueryBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // "/" focuses the query bar (unless already typing somewhere).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div style={{
      padding: 'var(--space-3) var(--space-6)',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0,
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke={query ? 'var(--text-accent)' : 'var(--text-tertiary)'}
        strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => onChange(e.target.value)}
        placeholder="Query a concept…  ( / )"
        style={{
          flex: 1, fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)',
          color: 'var(--text-primary)', background: 'transparent',
        }}
      />
      {loading && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          searching…
        </span>
      )}
      {canGather && (
        <button
          onClick={onToggleGather}
          style={{
            fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
            color: gathering ? 'var(--bg-primary)' : 'var(--text-accent)',
            background: gathering ? 'var(--text-accent)' : 'transparent',
            border: '1px solid var(--text-accent)', borderRadius: 'var(--radius-full)',
            padding: '2px var(--space-3)', transition: 'all var(--duration-fast) ease',
          }}>
          {gathering ? 'release' : 'gather around query'}
        </button>
      )}
      {query && (
        <button onClick={onClear}
          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          clear
        </button>
      )}
      <button onClick={onFit}
        style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', padding: '0 var(--space-2)' }}>
        fit
      </button>
    </div>
  )
}
