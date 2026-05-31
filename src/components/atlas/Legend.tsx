import { useState } from 'react'
import { regionPalette } from '@/lib/atlas/colors'

export interface LegendRegion {
  regionId: string | null
  name: string
  count: number
}

interface LegendProps {
  regions: LegendRegion[]
  dark: boolean
  onPick: (regionId: string | null) => void
}

export function Legend({ regions, dark, onPick }: LegendProps) {
  const [open, setOpen] = useState(true)
  if (regions.length === 0) return null

  return (
    <div style={{
      position: 'absolute', right: 'var(--space-6)', top: 'var(--space-6)',
      maxWidth: 220, background: 'var(--bg-overlay)', backdropFilter: 'blur(6px)',
      border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3)', zIndex: 15,
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        fontSize: '0.625rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        <span>Territories</span>
        <span style={{ opacity: 0.6 }}>{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'var(--space-2)', maxHeight: 240, overflowY: 'auto' }}>
          {regions.map(r => {
            const pal = regionPalette(r.regionId, dark)
            return (
              <button key={r.regionId ?? '__none__'} onClick={() => onPick(r.regionId)} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                padding: '3px var(--space-2)', borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textAlign: 'left',
                fontFamily: 'var(--font-body)', transition: 'background var(--duration-fast) ease',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{
                  width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                  background: pal.mote, border: `1px solid ${pal.border}`,
                }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '0.625rem' }}>
                  {r.count}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
