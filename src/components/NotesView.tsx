import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { NoteEditorTipTap } from '@/components/NoteEditorTipTap'
import { archiveNotes, deleteNote as deleteSingleNote, deleteNotes, toggleNoteArchive } from '@/lib/noteActions'
import type { Note } from '@/types'

interface NotesViewProps {
  initialNoteId?: string | null
  onNoteIdChange?: (id: string | null) => void
}

export function NotesView({ initialNoteId, onNoteIdChange }: NotesViewProps) {
  const [internalEditingId, setInternalEditingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const editingId = initialNoteId !== undefined ? (initialNoteId ?? null) : internalEditingId
  const isNew = editingId === '__new__'

  const setEditingId = useCallback((id: string | null) => {
    setInternalEditingId(id)
    onNoteIdChange?.(id)
  }, [onNoteIdChange])

  const notes = useLiveQuery(
    () => db.notes.orderBy('updatedAt').reverse().toArray(),
  )

  const filtered = useMemo(() => {
    let list = (notes ?? []).filter(n => showArchived ? n.archivedAt !== null : n.archivedAt === null)
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase()
      list = list.filter(n => n.contentMd.toLowerCase().includes(q))
    }
    return list
  }, [notes, showArchived, filterQuery])

  const selectedFilteredIds = useMemo(() =>
    filtered.filter(n => selectedIds.has(n.id)).map(n => n.id), [filtered, selectedIds])

  const allFilteredSelected = filtered.length > 0 && selectedFilteredIds.length === filtered.length

  const openNote = useCallback((id: string) => {
    setEditingId(id)
  }, [setEditingId])

  const openNew = useCallback(() => {
    setEditingId('__new__')
  }, [setEditingId])

  const goBack = useCallback(() => {
    setEditingId(null)
  }, [setEditingId])

  const toggleSelectMode = useCallback(() => {
    if (selectionMode) setSelectedIds(new Set())
    setSelectionMode(active => !active)
  }, [selectionMode])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const note of filtered) next.add(note.id)
      return next
    })
  }, [filtered])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleBulkArchive = useCallback(async () => {
    if (selectedFilteredIds.length === 0) return
    await archiveNotes(selectedFilteredIds, !showArchived)
    setSelectedIds(new Set())
    setSelectionMode(false)
  }, [selectedFilteredIds, showArchived])

  const handleBulkDelete = useCallback(async () => {
    if (selectedFilteredIds.length === 0) return
    const label = selectedFilteredIds.length === 1 ? 'this note' : `${selectedFilteredIds.length} notes`
    if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return
    await deleteNotes(selectedFilteredIds)
    setSelectedIds(new Set())
    setSelectionMode(false)
  }, [selectedFilteredIds])

  const handleArchiveViewToggle = useCallback(() => {
    setShowArchived(s => !s)
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  if (editingId) {
    return (
      <NoteEditorTipTap
        noteId={isNew ? null : editingId}
        onBack={goBack}
        onDeleted={goBack}
      />
    )
  }

  return (
    <div className="fade-in" style={{
      height: '100%',
      overflowY: 'auto',
      padding: 'var(--space-8)',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-6)',
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-3xl)',
              fontWeight: 400,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}>
              {showArchived ? 'Archived' : 'All Notes'}
            </h2>
            {filtered.length > 0 && (
              <p style={{
                marginTop: 'var(--space-2)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
              }}>
                {filtered.length} {filtered.length === 1 ? 'note' : 'notes'}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <HeaderButton active={selectionMode} onClick={toggleSelectMode}>
              {selectionMode ? 'cancel select' : 'select'}
            </HeaderButton>
            <HeaderButton active={showArchived} onClick={handleArchiveViewToggle}>
              {showArchived ? 'show active' : 'show archived'}
            </HeaderButton>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 'var(--space-5)', position: 'relative' }}>
          <input
            type="text"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            placeholder="Filter notes..."
            style={{
              width: '100%',
              padding: 'var(--space-3) var(--space-4)',
              paddingLeft: 'var(--space-10)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-body)',
              color: 'var(--text-primary)',
              transition: 'border-color var(--duration-fast) ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
          />
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', padding: 2,
              }}
            >
              &times;
            </button>
          )}
        </div>

        {selectionMode && (
          <BulkSelectionBar
            selectedCount={selectedFilteredIds.length}
            totalCount={filtered.length}
            allSelected={allFilteredSelected}
            archived={showArchived}
            onSelectAll={selectAllFiltered}
            onClear={clearSelection}
            onArchive={handleBulkArchive}
            onDelete={handleBulkDelete}
          />
        )}

        {/* New note button */}
        <button
          onClick={openNew}
          style={{
            width: '100%',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
            transition: 'all var(--duration-fast) ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--text-accent)'
            e.currentTarget.style.color = 'var(--text-accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-default)'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          <span style={{ fontSize: '1.1em', fontWeight: 300 }}>+</span>
          New note
        </button>

        {/* Notes list */}
        {filtered.length === 0 ? (
          <EmptyState archived={showArchived} hasFilter={!!filterQuery} />
        ) : (
          <div className="stagger-children" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}>
            {filtered.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                selectionMode={selectionMode}
                selected={selectedIds.has(note.id)}
                onToggleSelected={() => toggleSelected(note.id)}
                onClick={() => selectionMode ? toggleSelected(note.id) : openNote(note.id)}
                onArchive={() => toggleNoteArchive(note)}
                onDelete={() => deleteSingleNoteWithConfirm(note.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

async function deleteSingleNoteWithConfirm(id: string) {
  if (!confirm('Permanently delete this note? This cannot be undone.')) return
  await deleteSingleNote(id)
}

function HeaderButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        color: active ? 'var(--text-accent)' : 'var(--text-tertiary)',
        padding: 'var(--space-1) var(--space-3)',
        borderRadius: 'var(--radius-full)',
        background: active ? 'var(--selection-bg)' : 'transparent',
        transition: 'all var(--duration-fast) ease',
      }}
    >
      {children}
    </button>
  )
}

function BulkSelectionBar({
  selectedCount,
  totalCount,
  allSelected,
  archived,
  onSelectAll,
  onClear,
  onArchive,
  onDelete,
}: {
  selectedCount: number
  totalCount: number
  allSelected: boolean
  archived: boolean
  onSelectAll: () => void
  onClear: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <div style={{
      marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)',
      border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
          color: selectedCount > 0 ? 'var(--text-accent)' : 'var(--text-tertiary)',
        }}>
          {selectedCount} selected
        </span>
        <BulkButton disabled={totalCount === 0 || allSelected} onClick={onSelectAll}>select all shown</BulkButton>
        <BulkButton disabled={selectedCount === 0} onClick={onClear}>clear</BulkButton>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <BulkButton disabled={selectedCount === 0} onClick={onArchive}>{archived ? 'unarchive' : 'archive'}</BulkButton>
        <BulkButton danger disabled={selectedCount === 0} onClick={onDelete}>delete</BulkButton>
      </div>
    </div>
  )
}

function BulkButton({ children, disabled, danger, onClick }: {
  children: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
        color: danger ? 'var(--color-contradicts)' : 'var(--text-tertiary)',
        padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border-subtle)', opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function NoteCard({ note, selectionMode, selected, onToggleSelected, onClick, onArchive, onDelete }: {
  note: Note
  selectionMode: boolean
  selected: boolean
  onToggleSelected: () => void
  onClick: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const title = useMemo(() => {
    if (!note.contentMd.startsWith('#')) return null
    const firstLine = note.contentMd.split('\n')[0]
    const cleaned = firstLine.replace(/^#{1,6}\s*/, '').trim()
    return cleaned.length > 80 ? cleaned.slice(0, 80) + '...' : cleaned
  }, [note.contentMd])

  const preview = useMemo(() => {
    const plain = note.contentMd
      .replace(/#{1,6}\s/g, '').replace(/[*_~`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\n+/g, ' ').trim()
    const text = title ? plain.replace(title.replace('...', ''), '').trim() : plain
    return text.length > 180 ? text.slice(0, 180) + '...' : text
  }, [note.contentMd, title])

  const timeAgo = formatTimeAgo(note.updatedAt)

  return (
    <div style={{
      position: 'relative',
      background: 'var(--bg-surface)',
      border: selected ? '1px solid var(--text-accent)' : '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      transition: 'border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease',
      opacity: note.archivedAt ? 0.6 : 1,
      boxShadow: selected ? '0 0 0 3px var(--selection-bg)' : 'none',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = selected ? 'var(--text-accent)' : 'var(--border-default)'
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = selected ? 'var(--text-accent)' : 'var(--border-subtle)'
        e.currentTarget.style.boxShadow = selected ? '0 0 0 3px var(--selection-bg)' : 'none'
      }}
    >
      {selectionMode && (
        <button
          type="button"
          aria-label={selected ? 'Deselect note' : 'Select note'}
          aria-pressed={selected}
          onClick={onToggleSelected}
          style={{
            position: 'absolute', left: 16, top: 18, zIndex: 2,
            width: 22, height: 22, borderRadius: 'var(--radius-sm)',
            border: selected ? '1px solid var(--text-accent)' : '1px solid var(--border-default)',
            background: selected ? 'var(--text-accent)' : 'var(--bg-elevated)',
            color: selected ? 'var(--bg-primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
          }}
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </button>
      )}
      <button
        onClick={onClick}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          padding: selectionMode
            ? 'var(--space-5) var(--space-6) var(--space-5) var(--space-12)'
            : 'var(--space-5) var(--space-6)',
          cursor: 'pointer',
        }}
      >
        {title && (
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
            fontWeight: 400, color: 'var(--text-primary)',
            marginBottom: 'var(--space-2)', lineHeight: 1.3,
          }}>
            {title}
          </div>
        )}
        <div style={{
          fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
          lineHeight: 1.6, display: '-webkit-box',
          WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {preview}
        </div>
        <div style={{
          marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center',
          gap: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
        }}>
          <span style={{
            fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
            fontFamily: 'var(--font-mono)', opacity: 0.7,
          }}>
            {note.kind}
          </span>
          <span style={{ opacity: 0.3 }}>&middot;</span>
          <span>{timeAgo}</span>
          {note.embedding && (
            <>
              <span style={{ opacity: 0.3 }}>&middot;</span>
              <span style={{ color: 'var(--color-supports)', opacity: 0.7 }}>embedded</span>
            </>
          )}
        </div>
      </button>

      {/* Three-dot menu */}
      <div ref={menuRef} style={{ position: 'absolute', top: 12, right: 12 }}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center',
            justifyContent: 'center', borderRadius: 'var(--radius-md)',
            color: 'var(--text-tertiary)', fontSize: '1.1em',
            transition: 'all var(--duration-fast) ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-elevated)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          &middot;&middot;&middot;
        </button>
        {menuOpen && (
          <div style={{
            position: 'absolute', top: 32, right: 0, zIndex: 20,
            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
            minWidth: 140, overflow: 'hidden',
            animation: 'fade-in var(--duration-fast) var(--ease-out)',
          }}>
            <MenuButton
              label={note.archivedAt ? 'Unarchive' : 'Archive'}
              onClick={() => { setMenuOpen(false); onArchive() }}
            />
            <MenuButton
              label="Delete"
              danger
              onClick={() => { setMenuOpen(false); onDelete() }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function MenuButton({ label, danger, onClick }: {
  label: string; danger?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: 'var(--space-2) var(--space-4)',
        fontSize: 'var(--text-sm)',
        color: danger ? 'var(--color-contradicts)' : 'var(--text-primary)',
        transition: 'background var(--duration-fast) ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-surface-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {label}
    </button>
  )
}

function EmptyState({ archived, hasFilter }: { archived: boolean; hasFilter: boolean }) {
  if (hasFilter) {
    return (
      <div style={{
        padding: 'var(--space-12) var(--space-8)', textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
          color: 'var(--text-tertiary)', fontStyle: 'italic',
        }}>
          No matching notes
        </p>
      </div>
    )
  }
  if (archived) {
    return (
      <div style={{
        padding: 'var(--space-12) var(--space-8)', textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
          color: 'var(--text-tertiary)', fontStyle: 'italic',
        }}>
          No archived notes
        </p>
      </div>
    )
  }
  return (
    <div className="fade-in-up" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 'var(--space-16) var(--space-8)',
      textAlign: 'center',
    }}>
      <div style={{ width: 48, height: 48, marginBottom: 'var(--space-6)', opacity: 0.15 }}>
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <path d="M12 42 C12 42 8 38 10 34 C12 30 16 28 18 24 C20 20 20 16 22 12 C24 8 28 4 36 4 C36 4 34 10 32 14 C30 18 28 22 26 26 C24 30 24 34 22 38 C20 42 16 42 12 42Z" />
          <path d="M12 42 L8 46" />
        </svg>
      </div>
      <p style={{
        fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
        color: 'var(--text-secondary)', fontWeight: 300,
        marginBottom: 'var(--space-3)', fontStyle: 'italic',
      }}>
        No notes yet
      </p>
      <p style={{
        fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
        maxWidth: 280, lineHeight: 1.6,
      }}>
        Press <kbd style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          padding: '0.15em 0.45em', background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)',
        }}>N</kbd> to begin writing your first thought.
      </p>
    </div>
  )
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
