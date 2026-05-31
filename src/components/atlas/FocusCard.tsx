import { getTitle, getPreview } from '@/lib/noteText'
import type { Note } from '@/types'

interface FocusCardProps {
  note: Note
  regionName: string | null
  edgeCount: number
  onOpen: () => void
  onRerun: () => void
  onArchive: () => void
  onClose: () => void
}

export function FocusCard({
  note, regionName, edgeCount, onOpen, onRerun, onArchive, onClose,
}: FocusCardProps) {
  const title = getTitle(note.contentMd) || 'Untitled'
  const preview = getPreview(note.contentMd, 240)

  return (
    <div className="fade-in-up" style={{
      position: 'absolute', left: 'var(--space-6)', bottom: 'var(--space-6)',
      width: 320, maxWidth: 'calc(100% - var(--space-12))',
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
      padding: 'var(--space-5)', display: 'flex', flexDirection: 'column',
      gap: 'var(--space-3)', zIndex: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{
            fontSize: '0.625rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            color: 'var(--text-tertiary)', textTransform: 'uppercase',
          }}>
            {regionName ?? 'unclustered'} · {note.kind}
          </span>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 500,
            color: 'var(--text-primary)', lineHeight: 1.2,
          }}>
            {title}
          </h3>
        </div>
        <button onClick={onClose} aria-label="Close"
          style={{ color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      <p style={{
        fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6,
        display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {preview}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
        <span>{edgeCount} {edgeCount === 1 ? 'thread' : 'threads'}</span>
        {!note.embedding && <span style={{ opacity: 0.7 }}>· no embedding</span>}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
        <ActionButton primary onClick={onOpen}>Open</ActionButton>
        <ActionButton onClick={onRerun}>Re-run agent</ActionButton>
        <ActionButton onClick={onArchive}>Archive</ActionButton>
      </div>
    </div>
  )
}

function ActionButton({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
      padding: '4px var(--space-3)', borderRadius: 'var(--radius-md)',
      color: primary ? 'var(--bg-primary)' : 'var(--text-secondary)',
      background: primary ? 'var(--text-accent)' : 'var(--bg-elevated)',
      border: primary ? 'none' : '1px solid var(--border-subtle)',
      transition: 'all var(--duration-fast) ease',
    }}>
      {children}
    </button>
  )
}
