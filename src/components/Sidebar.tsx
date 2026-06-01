import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import type { Region } from '@/types'

type View = 'notes' | 'map' | 'atlas' | 'review' | 'import-export' | 'settings'

interface SidebarProps {
  activeView: View
  onViewChange: (view: View) => void
  onNewNote: () => void
  onSearch: () => void
}

export function Sidebar({ activeView, onViewChange, onNewNote, onSearch }: SidebarProps) {
  const regions = useLiveQuery(async () => {
    const [allRegions, activeNotes] = await Promise.all([
      db.regions.toArray(),
      db.notes.filter(n => n.archivedAt === null && n.regionId !== null).toArray(),
    ])
    const activeRegionIds = new Set(activeNotes.map(n => n.regionId))
    return allRegions.filter(region => activeRegionIds.has(region.id))
  }) ?? []
  const noteCount = useLiveQuery(() => db.notes.filter(n => n.archivedAt === null).count()) ?? 0
  const isMac = navigator.platform.includes('Mac')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Search trigger */}
      <div style={{ padding: 'var(--space-2) var(--space-3) 0' }}>
        <button
          onClick={onSearch}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
            color: 'var(--text-tertiary)', background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            transition: 'all var(--duration-fast) ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--border-default)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search
          <span style={{
            marginLeft: 'auto', fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)', opacity: 0.5,
          }}>
            {isMac ? '⌘' : 'Ctrl'}K
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav style={{
        padding: 'var(--space-3)', display: 'flex',
        flexDirection: 'column', gap: '1px',
      }}>
        <NavItem
          label="Notes"
          count={noteCount}
          active={activeView === 'notes'}
          onClick={() => onViewChange('notes')}
          icon={<StackIcon />}
        />
        <NavItem
          label="Atlas"
          active={activeView === 'atlas'}
          onClick={() => onViewChange('atlas')}
          icon={<CompassIcon />}
        />
        <NavItem
          label="Review"
          active={activeView === 'review'}
          onClick={() => onViewChange('review')}
          icon={<CheckIcon />}
        />
        <NavItem
          label="Import / Export"
          active={activeView === 'import-export'}
          onClick={() => onViewChange('import-export')}
          icon={<ArrowsIcon />}
        />
        <NavItem
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => onViewChange('settings')}
          icon={<GearIcon />}
        />
      </nav>

      {/* Divider */}
      <div style={{
        margin: 'var(--space-2) var(--space-4)',
        borderTop: '1px solid var(--border-subtle)',
      }} />

      {/* Regions */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-3)' }}>
        <div style={{
          padding: 'var(--space-2) var(--space-3)',
          fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-tertiary)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
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
              fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
              fontStyle: 'italic', lineHeight: 1.5,
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
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--text-accent)', color: 'var(--bg-primary)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
            fontWeight: 600, fontFamily: 'var(--font-body)',
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
            marginLeft: 'auto', fontSize: 'var(--text-xs)',
            opacity: 0.55, fontWeight: 400, fontFamily: 'var(--font-mono)',
          }}>N</span>
        </button>
      </div>
    </div>
  )
}

function NavItem({ label, count, active, onClick, icon }: {
  label: string; count?: number; active: boolean; onClick: () => void; icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)', fontWeight: active ? 500 : 400,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: active ? 'var(--bg-surface)' : 'transparent',
        transition: 'all var(--duration-fast) ease', width: '100%', textAlign: 'left',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-surface-hover)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ opacity: active ? 0.9 : 0.5, display: 'flex' }}>{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          marginLeft: 'auto', fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)',
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

function RegionItem({ region }: { region: Region }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
      fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
      width: '100%', textAlign: 'left', transition: 'all var(--duration-fast) ease',
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
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--text-accent)', opacity: 0.5, flexShrink: 0,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {region.name}
      </span>
    </button>
  )
}

function StackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  )
}



function CompassIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
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

function ArrowsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M12 3l-4 4M12 3l4 4M5 21h14" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
