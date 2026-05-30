import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
}

interface MapContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  title?: string
  onClose: () => void
}

export function MapContextMenu({ x, y, items, title, onClose }: MapContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const maxWidth = 260
  const adjustedX = Math.min(x, window.innerWidth - maxWidth - 8)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 48)

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 1000,
        minWidth: 200,
        maxWidth,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        padding: 'var(--space-1) 0',
        fontFamily: 'var(--font-body)',
        animation: 'fade-in var(--duration-fast) var(--ease-out)',
      }}
    >
      {title && (
        <div style={{
          padding: 'var(--space-2) var(--space-4)',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 'var(--space-1)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {title}
        </div>
      )}
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={i}
              style={{
                height: 1,
                background: 'var(--border-subtle)',
                margin: 'var(--space-1) 0',
              }}
            />
          )
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose() } }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 'var(--text-sm)',
              color: item.disabled
                ? 'var(--text-tertiary)'
                : item.danger
                  ? 'var(--color-contradicts)'
                  : 'var(--text-primary)',
              opacity: item.disabled ? 0.5 : 1,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              transition: 'background var(--duration-fast) ease',
            }}
            onMouseEnter={e => {
              if (!item.disabled) e.currentTarget.style.background = 'var(--bg-surface-hover)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
