import { useState, useCallback } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Sidebar } from '@/components/Sidebar'
import { WriteView } from '@/components/WriteView'
import { NotesView } from '@/components/NotesView'
import { GraphPlaceholder } from '@/components/GraphPlaceholder'
import { ReviewPlaceholder } from '@/components/ReviewPlaceholder'
import { useHotkey } from '@/hooks/useHotkey'
import { useMediaQuery } from '@/hooks/useMediaQuery'

type View = 'write' | 'notes' | 'graph' | 'review'

interface ShellProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Shell({ theme, onToggleTheme }: ShellProps) {
  const [activeView, setActiveView] = useState<View>('write')
  const [writeOverlay, setWriteOverlay] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const openWrite = useCallback(() => {
    if (activeView === 'write') return
    setWriteOverlay(true)
  }, [activeView])

  useHotkey('n', openWrite)
  useHotkey('Escape', () => setWriteOverlay(false), writeOverlay)

  const handleNewNote = useCallback(() => {
    if (activeView === 'write') return
    setWriteOverlay(true)
  }, [activeView])

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      {/* Sidebar */}
      {isDesktop && (
        <aside style={{
          width: 'var(--sidebar-width)',
          minWidth: 'var(--sidebar-width)',
          height: '100%',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          overflow: 'hidden',
          transition: 'background var(--duration-slow) var(--ease-in-out)',
        }}>
          {/* Brand */}
          <div style={{
            padding: 'var(--space-5) var(--space-5) var(--space-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--space-2)',
            }}>
              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                fontWeight: 400,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}>
                Noted
              </h1>
              <span style={{
                fontSize: '0.625rem',
                color: 'var(--text-tertiary)',
                fontWeight: 500,
                letterSpacing: '0.04em',
                fontFamily: 'var(--font-mono)',
                opacity: 0.6,
              }}>
                v2
              </span>
            </div>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>

          {/* Sidebar content */}
          <Sidebar
            activeView={activeView}
            onViewChange={setActiveView}
            onNewNote={handleNewNote}
          />
        </aside>
      )}

      {/* Main content */}
      <main style={{
        flex: 1,
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        transition: 'background var(--duration-slow) var(--ease-in-out)',
      }}>
        {/* Mobile header */}
        {!isDesktop && (
          <MobileHeader
            theme={theme}
            onToggleTheme={onToggleTheme}
            onNewNote={handleNewNote}
          />
        )}

        {/* View router */}
        <div style={{
          height: isDesktop ? '100%' : 'calc(100% - 56px)',
          overflow: 'hidden',
        }}>
          {activeView === 'write' && <WriteView />}
          {activeView === 'notes' && <NotesView />}
          {activeView === 'graph' && <GraphPlaceholder />}
          {activeView === 'review' && <ReviewPlaceholder />}
        </div>

        {/* Write overlay (when not on write tab) */}
        {writeOverlay && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            background: 'var(--bg-overlay)',
            backdropFilter: 'blur(12px)',
            animation: 'fade-in var(--duration-normal) var(--ease-out)',
          }}>
            <div style={{
              height: '100%',
              animation: 'scale-in var(--duration-slow) var(--ease-out)',
            }}>
              <WriteView
                onClose={() => setWriteOverlay(false)}
                onSaved={() => {}}
              />
            </div>
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      {!isDesktop && (
        <MobileNav
          activeView={activeView}
          onViewChange={setActiveView}
        />
      )}

      {/* Grain texture */}
      <div className="grain-overlay" />
    </div>
  )
}

function MobileHeader({ theme, onToggleTheme, onNewNote }: {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onNewNote: () => void
}) {
  return (
    <header style={{
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 var(--space-4)',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)',
      flexShrink: 0,
    }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-xl)',
        fontWeight: 400,
        color: 'var(--text-primary)',
        letterSpacing: '-0.02em',
      }}>
        Noted
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button
          onClick={onNewNote}
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-md)',
            background: 'var(--text-accent)',
            color: 'var(--bg-primary)',
            fontSize: '1.2em',
            fontWeight: 300,
          }}
        >
          +
        </button>
      </div>
    </header>
  )
}

function MobileNav({ activeView, onViewChange }: {
  activeView: View
  onViewChange: (v: View) => void
}) {
  const items: { view: View; label: string }[] = [
    { view: 'write', label: 'Write' },
    { view: 'notes', label: 'Notes' },
    { view: 'graph', label: 'Graph' },
    { view: 'review', label: 'Review' },
  ]

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 52,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-subtle)',
      zIndex: 100,
    }}>
      {items.map(({ view, label }) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: 'var(--space-2)',
            fontSize: 'var(--text-xs)',
            fontWeight: activeView === view ? 500 : 400,
            color: activeView === view ? 'var(--text-accent)' : 'var(--text-tertiary)',
            transition: 'color var(--duration-fast) ease',
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
