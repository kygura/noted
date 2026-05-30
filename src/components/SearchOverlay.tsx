import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchLiteral, searchHybrid, embedText, type SearchResult } from '@/lib/search'
import { db } from '@/db'

interface SearchOverlayProps {
  onClose: () => void
  onSelectNote: (id: string) => void
}

export function SearchOverlay({ onClose, onSelectNote }: SearchOverlayProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const settings = await db.settings.get('app')
      const apiKey = settings?.openaiApiKey
      if (apiKey) {
        try {
          const qEmb = await embedText(q, apiKey)
          const r = await searchHybrid(q, qEmb)
          setResults(r.slice(0, 20))
        } catch {
          const r = await searchLiteral(q)
          setResults(r.slice(0, 20))
        }
      } else {
        const r = await searchLiteral(q)
        setResults(r.slice(0, 20))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = useCallback((val: string) => {
    setQuery(val)
    setSelectedIdx(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(val), 300)
  }, [runSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      onSelectNote(results[selectedIdx].note.id)
      onClose()
    }
  }, [results, selectedIdx, onSelectNote, onClose])

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
        background: 'var(--bg-overlay)', backdropFilter: 'blur(12px)',
        animation: 'fade-in var(--duration-fast) var(--ease-out)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        animation: 'scale-in var(--duration-normal) var(--ease-out)',
      }}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: results.length > 0 || loading ? '1px solid var(--border-subtle)' : 'none',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes..."
            style={{
              flex: 1, fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)',
              color: 'var(--text-primary)', background: 'transparent',
            }}
          />
          {loading && (
            <span style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}>
              searching...
            </span>
          )}
          <kbd style={{
            fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
            color: 'var(--text-tertiary)', padding: '0.1em 0.4em',
            background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}>
            esc
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: 'var(--space-2)' }}>
            {results.map((r, i) => (
              <SearchResultItem
                key={r.note.id}
                result={r}
                selected={i === selectedIdx}
                onClick={() => { onSelectNote(r.note.id); onClose() }}
                onMouseEnter={() => setSelectedIdx(i)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {query.trim() && !loading && results.length === 0 && (
          <div style={{
            padding: 'var(--space-6)', textAlign: 'center',
          }}>
            <p style={{
              fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
              fontStyle: 'italic',
            }}>
              No results for "{query}"
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function SearchResultItem({ result, selected, onClick, onMouseEnter }: {
  result: SearchResult
  selected: boolean
  onClick: () => void
  onMouseEnter: () => void
}) {
  const { note } = result

  const title = useMemo(() => {
    if (!note.contentMd.startsWith('#')) return null
    const firstLine = note.contentMd.split('\n')[0]
    return firstLine.replace(/^#{1,6}\s*/, '').trim().slice(0, 80)
  }, [note.contentMd])

  const preview = useMemo(() => {
    const plain = note.contentMd
      .replace(/#{1,6}\s/g, '').replace(/[*_~`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\n+/g, ' ').trim()
    return plain.slice(0, 120)
  }, [note.contentMd])

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        background: selected ? 'var(--bg-surface-hover)' : 'transparent',
        cursor: 'pointer',
        transition: 'background var(--duration-fast) ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span style={{
          fontSize: 'var(--text-sm)', fontWeight: 500,
          color: 'var(--text-primary)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title || preview.slice(0, 50)}
        </span>
        {result.semanticScore > 0 && (
          <span style={{
            fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
            color: 'var(--color-elaborates)', opacity: 0.8,
            flexShrink: 0,
          }}>
            {Math.round(result.semanticScore * 100)}% match
          </span>
        )}
      </div>
      {title && (
        <div style={{
          fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
          marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {preview}
        </div>
      )}
    </button>
  )
}
