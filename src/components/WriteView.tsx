import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '@/db'
import type { Note } from '@/types'

interface WriteViewProps {
  editingNote?: Note | null
  onSaved?: () => void
  onClose?: () => void
}

export function WriteView({ editingNote, onSaved, onClose }: WriteViewProps) {
  const [content, setContent] = useState(editingNote?.contentMd ?? '')
  const [kind, setKind] = useState<'thought' | 'source'>(editingNote?.kind ?? 'thought')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 60)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = useCallback(async () => {
    if (!content.trim() || saving) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      if (editingNote) {
        await db.notes.update(editingNote.id, {
          contentMd: content.trim(),
          kind,
          updatedAt: now,
          revisionCount: editingNote.revisionCount + 1,
        })
      } else {
        const note: Note = {
          id: crypto.randomUUID(),
          regionId: null,
          kind,
          contentMd: content.trim(),
          style: null,
          intent: null,
          completionState: null,
          domain: null,
          graphX: Math.random() * 800 - 400,
          graphY: Math.random() * 600 - 300,
          placementRationale: null,
          revisionCount: 0,
          importSource: null,
          createdAt: now,
          updatedAt: now,
        }
        await db.notes.add(note)
      }
      setSaved(true)
      setSaving(false)
      setTimeout(() => setSaved(false), 1800)
      if (!editingNote) setContent('')
      onSaved?.()
    } catch {
      setSaving(false)
    }
  }, [content, kind, saving, editingNote, onSaved])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      setContent(c => c.substring(0, start) + '  ' + c.substring(end))
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }, [handleSave])

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0
  const isMac = navigator.platform.includes('Mac')

  return (
    <div className="fade-in" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-write)',
    }}>
      {/* Minimal top bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-4) var(--space-6)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          {(['thought', 'source'] as const).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                padding: 'var(--space-1) var(--space-3)',
                borderRadius: 'var(--radius-full)',
                background: kind === k ? 'var(--selection-bg)' : 'transparent',
                color: kind === k ? 'var(--text-accent)' : 'var(--text-tertiary)',
                transition: 'all var(--duration-fast) ease',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {k}
            </button>
          ))}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}>
          {/* Saved indicator */}
          <span style={{
            fontSize: 'var(--text-xs)',
            color: saved ? 'var(--color-supports)' : 'transparent',
            fontFamily: 'var(--font-mono)',
            transition: 'color var(--duration-normal) ease',
          }}>
            saved
          </span>

          {/* Word count */}
          {wordCount > 0 && (
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              background: content.trim() && !saving ? 'var(--text-accent)' : 'var(--bg-elevated)',
              color: content.trim() && !saving ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              transition: 'all var(--duration-fast) ease',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
            <span style={{
              fontSize: 'var(--text-xs)',
              opacity: 0.55,
              fontFamily: 'var(--font-mono)',
              fontWeight: 400,
            }}>
              {isMac ? '⌘' : 'Ctrl'}+S
            </span>
          </button>
        </div>
      </header>

      {/* Writing area */}
      <div style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        overflowY: 'auto',
        padding: 'var(--space-10) var(--space-6)',
      }}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Begin writing..."
          spellCheck
          style={{
            width: '100%',
            maxWidth: 680,
            height: '100%',
            minHeight: '60vh',
            resize: 'none',
            fontSize: 'var(--text-lg)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.82,
            color: 'var(--text-primary)',
            background: 'transparent',
            caretColor: 'var(--text-accent)',
            letterSpacing: '0.002em',
          }}
        />
      </div>

      {/* Bottom hint */}
      <footer style={{
        padding: 'var(--space-3) var(--space-6)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-6)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          opacity: 0.7,
        }}>
          markdown supported
        </span>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          opacity: 0.7,
        }}>
          esc to close
        </span>
      </footer>
    </div>
  )
}
