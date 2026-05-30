import { useState, useCallback, useEffect } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Sidebar } from '@/components/Sidebar'
import { NotesView } from '@/components/NotesView'
import { MapView } from '@/components/MapView'
import { ReviewPlaceholder } from '@/components/ReviewPlaceholder'
import { ImportExportView } from '@/components/ImportExportView'
import { SettingsView } from '@/components/SettingsView'
import { SearchOverlay } from '@/components/SearchOverlay'
import { useHotkey } from '@/hooks/useHotkey'
import { useMediaQuery } from '@/hooks/useMediaQuery'

type View = 'notes' | 'map' | 'review' | 'import-export' | 'settings'

interface ShellProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Shell({ theme, onToggleTheme }: ShellProps) {
  const [activeView, setActiveView] = useState<View>('notes')
  const [editNoteId, setEditNoteId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Cmd+K search overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // N key for new note
  useHotkey('n', () => {
    setActiveView('notes')
    setEditNoteId('__new__')
  })

  const handleNewNote = useCallback(() => {
    setActiveView('notes')
    setEditNoteId('__new__')
  }, [])

  const handleSelectNote = useCallback((id: string) => {
    setActiveView('notes')
    setEditNoteId(id)
  }, [])

  const handleMapOpenNote = useCallback((id: string) => {
    setActiveView('notes')
    setEditNoteId(id)
  }, [])

  return (
    <div style={{
      display: 'flex', height: '100%', overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      {/* Sidebar */}
      {isDesktop && (
        <aside style={{
          width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)',
          height: '100%', borderRight: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)', overflow: 'hidden',
          transition: 'background var(--duration-slow) var(--ease-in-out)',
        }}>
          {/* Brand */}
          <div style={{
            padding: 'var(--space-5) var(--space-5) var(--space-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)',
            }}>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
                fontWeight: 400, color: 'var(--text-primary)',
                letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                Noted
              </h1>
              <span style={{
                fontSize: '0.625rem', color: 'var(--text-tertiary)',
                fontWeight: 500, letterSpacing: '0.04em',
                fontFamily: 'var(--font-mono)', opacity: 0.6,
              }}>
                v2
              </span>
            </div>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>

          <Sidebar
            activeView={activeView}
            onViewChange={setActiveView}
            onNewNote={handleNewNote}
            onSearch={() => setShowSearch(true)}
          />
        </aside>
      )}

      {/* Main content */}
      <main style={{
        flex: 1, height: '100%', overflow: 'hidden', position: 'relative',
        transition: 'background var(--duration-slow) var(--ease-in-out)',
      }}>
        {!isDesktop && (
          <MobileHeader
            theme={theme}
            onToggleTheme={onToggleTheme}
            onNewNote={handleNewNote}
            onSearch={() => setShowSearch(true)}
          />
        )}

        <div style={{
          height: isDesktop ? '100%' : 'calc(100% - 56px)',
          overflow: 'hidden',
        }}>
          {activeView === 'notes' && (
            <NotesView
              initialNoteId={editNoteId}
              onNoteIdChange={setEditNoteId}
            />
          )}
          {activeView === 'map' && (
            <MapView onOpenNote={handleMapOpenNote} />
          )}
          {activeView === 'review' && <ReviewPlaceholder />}
          {activeView === 'import-export' && (
            <ImportExportView onDone={() => setActiveView('notes')} />
          )}
          {activeView === 'settings' && <SettingsView />}
        </div>
      </main>

      {/* Mobile bottom nav */}
      {!isDesktop && (
        <MobileNav activeView={activeView} onViewChange={setActiveView} />
      )}

      {/* Search overlay */}
      {showSearch && (
        <SearchOverlay
          onClose={() => setShowSearch(false)}
          onSelectNote={handleSelectNote}
        />
      )}

      <div className="grain-overlay" />
    </div>
  )
}

function MobileHeader({ theme, onToggleTheme, onNewNote, onSearch }: {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onNewNote: () => void
  onSearch: () => void
}) {
  return (
    <header style={{
      height: 56, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 var(--space-4)',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)', flexShrink: 0,
    }}>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
        fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.02em',
      }}>
        Noted
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <button onClick={onSearch} style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center',
          justifyContent: 'center', borderRadius: 'var(--radius-md)',
          color: 'var(--text-tertiary)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button onClick={onNewNote} style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center',
          justifyContent: 'center', borderRadius: 'var(--radius-md)',
          background: 'var(--text-accent)', color: 'var(--bg-primary)',
          fontSize: '1.2em', fontWeight: 300,
        }}>+</button>
      </div>
    </header>
  )
}

function MobileNav({ activeView, onViewChange }: {
  activeView: View; onViewChange: (v: View) => void
}) {
  const items: { view: View; label: string }[] = [
    { view: 'notes', label: 'Notes' },
    { view: 'map', label: 'Map' },
    { view: 'review', label: 'Review' },
    { view: 'settings', label: 'Settings' },
  ]

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)',
      zIndex: 100,
    }}>
      {items.map(({ view, label }) => (
        <button key={view} onClick={() => onViewChange(view)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 2, padding: 'var(--space-2)', fontSize: 'var(--text-xs)',
          fontWeight: activeView === view ? 500 : 400,
          color: activeView === view ? 'var(--text-accent)' : 'var(--text-tertiary)',
          transition: 'color var(--duration-fast) ease',
        }}>
          {label}
        </button>
      ))}
    </nav>
  )
}
