import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useMemo } from 'react'

interface NotesViewProps {
  onNoteSelect?: (id: string) => void
}

export function NotesView({ onNoteSelect }: NotesViewProps) {
  const notes = useLiveQuery(
    () => db.notes.orderBy('updatedAt').reverse().toArray()
  ) ?? []

  return (
    <div className="fade-in" style={{
      height: '100%',
      overflowY: 'auto',
      padding: 'var(--space-8)',
    }}>
      <div style={{
        maxWidth: 700,
        margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{
          marginBottom: 'var(--space-8)',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-3xl)',
            fontWeight: 400,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}>
            All Notes
          </h2>
          {notes.length > 0 && (
            <p style={{
              marginTop: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </p>
          )}
        </div>

        {/* Notes list */}
        {notes.length === 0 ? (
          <EmptyNotes />
        ) : (
          <div className="stagger-children" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}>
            {notes.map(note => (
              <NoteCard
                key={note.id}
                id={note.id}
                contentMd={note.contentMd}
                kind={note.kind}
                updatedAt={note.updatedAt}
                onClick={() => onNoteSelect?.(note.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NoteCard({ id: _id, contentMd, kind, updatedAt, onClick }: {
  id: string
  contentMd: string
  kind: 'thought' | 'source'
  updatedAt: string
  onClick: () => void
}) {
  const preview = useMemo(() => {
    const plain = contentMd
      .replace(/#{1,6}\s/g, '')
      .replace(/[*_~`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim()
    return plain.length > 200 ? plain.slice(0, 200) + '...' : plain
  }, [contentMd])

  const title = useMemo(() => {
    const firstLine = contentMd.split('\n')[0]
    const cleaned = firstLine.replace(/^#{1,6}\s*/, '').trim()
    return cleaned.length > 80 ? cleaned.slice(0, 80) + '...' : cleaned
  }, [contentMd])

  const hasTitle = contentMd.startsWith('#')

  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(updatedAt).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(updatedAt).toLocaleDateString()
  }, [updatedAt])

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: 'var(--space-5) var(--space-6)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        transition: 'border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease, transform var(--duration-fast) ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--border-default)'
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {hasTitle && (
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 400,
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-2)',
          lineHeight: 1.3,
        }}>
          {title}
        </div>
      )}
      <div style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {hasTitle ? preview.replace(title.replace('...', ''), '').trim() || preview : preview}
      </div>
      <div style={{
        marginTop: 'var(--space-3)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
      }}>
        <span style={{
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontFamily: 'var(--font-mono)',
          opacity: 0.7,
        }}>
          {kind}
        </span>
        <span style={{ opacity: 0.3 }}>&middot;</span>
        <span>{timeAgo}</span>
      </div>
    </button>
  )
}

function EmptyNotes() {
  return (
    <div className="fade-in-up" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-24) var(--space-8)',
      textAlign: 'center',
    }}>
      {/* Decorative quill/ink element */}
      <div style={{
        width: 48,
        height: 48,
        marginBottom: 'var(--space-6)',
        opacity: 0.15,
      }}>
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <path d="M12 42 C12 42 8 38 10 34 C12 30 16 28 18 24 C20 20 20 16 22 12 C24 8 28 4 36 4 C36 4 34 10 32 14 C30 18 28 22 26 26 C24 30 24 34 22 38 C20 42 16 42 12 42Z" />
          <path d="M12 42 L8 46" />
        </svg>
      </div>
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-2xl)',
        color: 'var(--text-secondary)',
        fontWeight: 300,
        marginBottom: 'var(--space-3)',
        fontStyle: 'italic',
      }}>
        No notes yet
      </p>
      <p style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--text-tertiary)',
        maxWidth: 280,
        lineHeight: 1.6,
      }}>
        Press <kbd style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          padding: '0.15em 0.45em',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-default)',
        }}>N</kbd> to begin writing your first thought.
      </p>
    </div>
  )
}
