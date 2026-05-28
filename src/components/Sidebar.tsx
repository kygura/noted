import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import type { Region } from '@/types'

interface SidebarProps {
  activeView: 'write' | 'notes' | 'graph' | 'review'
  onViewChange: (view: 'write' | 'notes' | 'graph' | 'review') => void
  onNewNote: () => void
}

export function Sidebar({ activeView, onViewChange, onNewNote }: SidebarProps) {
  const regions = useLiveQuery(() => db.regions.toArray()) ?? []
  const noteCount = useLiveQuery(() => db.notes.count()) ?? 0

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Navigation */}
      <nav style={{
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
      }}>
        <NavItem
          label="Write"
          shortcut="N"
          active={activeView === 'write'}
          onClick={() => onViewChange('write')}
          icon={<PenIcon />}
        />
        <NavItem
          label="Notes"
          count={noteCount}
          active={activeView === 'notes'}
          onClick={() => onViewChange('notes')}
          icon={<StackIcon />}
        />
        <NavItem
          label="Graph"
          active={activeView === 'graph'}
          onClick={() => onViewChange('graph')}
          icon={<GraphIcon />}
        />
        <NavItem
          label="Review"
          active={activeView === 'review'}
          onClick={() => onViewChange('review')}
          icon={<CheckIcon />}
        />
      </nav>

      {/* Divider */}
      <div style={{
        margin: 'var(--space-2) var(--space-4)',
        borderTop: '1px solid var(--border-subtle)',
      }} />

      {/* Regions */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 var(--space-3)',
      }}>
        <div style={{
          padding: 'var(--space-2) var(--space-3)',
          fontSize: 'var(--text-xs)',
          fontWeight: 500,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}>
          Regions
        </div>
        <div className="stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {regions.map(region => (
            <RegionItem key={region.id} region={region} />
          ))}
          {regions.length === 0 && (
            <div style={{
              padding: 'var(--space-6) var(--space-3)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}>
              Regions emerge as you write.
            </div>
          )}
        </div>
      </div>

      {/* New note button */}
      <div style={{ padding: 'var(--space-3)' }}>
        <button
          onClick={onNewNote}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--text-accent)',
            color: 'var(--bg-primary)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.01em',
            transition: 'opacity var(--duration-fast) ease, transform var(--duration-fast) ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '0.88'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <span style={{ fontSize: '1.1em', fontWeight: 300 }}>+</span>
          New note
          <span style={{
            marginLeft: 'auto',
            fontSize: 'var(--text-xs)',
            opacity: 0.55,
            fontWeight: 400,
            fontFamily: 'var(--font-mono)',
          }}>N</span>
        </button>
      </div>
    </div>
  )
}

function NavItem({ label, shortcut, count, active, onClick, icon }: {
  label: string
  shortcut?: string
  count?: number
  active: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)',
        fontWeight: active ? 500 : 400,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: active ? 'var(--bg-surface)' : 'transparent',
        transition: 'all var(--duration-fast) ease',
        width: '100%',
        textAlign: 'left',
      }}
      onMouseEnter={e => {
        if (!active) e.currentTarget.style.background = 'var(--bg-surface-hover)'
      }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ opacity: active ? 0.9 : 0.5, display: 'flex' }}>{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          marginLeft: 'auto',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
        }}>
          {count}
        </span>
      )}
      {shortcut && !count && (
        <span style={{
          marginLeft: 'auto',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          opacity: 0.6,
        }}>
          {shortcut}
        </span>
      )}
    </button>
  )
}

function RegionItem({ region }: { region: Region }) {
  return (
    <button
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        width: '100%',
        textAlign: 'left',
        transition: 'all var(--duration-fast) ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-surface-hover)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--text-accent)',
        opacity: 0.5,
        flexShrink: 0,
      }} />
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {region.name}
      </span>
    </button>
  )
}

function PenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function StackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  )
}

function GraphIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
      <line x1="15.5" y1="7" x2="8.5" y2="7" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
