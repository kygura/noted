import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { runAgentPipeline } from '@/lib/agent'
import type { Note } from '@/types'

function getMarkdown(editor: NonNullable<ReturnType<typeof useEditor>>): string {
  // tiptap-markdown adds storage.markdown at runtime; type cast needed
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown()
}

// ---- Slash Commands ----------------------------------------------------------------

interface SlashCommandItem {
  title: string
  description: string
  execute: (e: ReturnType<typeof useEditor>) => void
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  { title: 'Heading 1', description: 'Large heading', execute: e => e?.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: 'Heading 2', description: 'Medium heading', execute: e => e?.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: 'Heading 3', description: 'Small heading', execute: e => e?.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: 'Bullet List', description: 'Unordered list', execute: e => e?.chain().focus().toggleBulletList().run() },
  { title: 'Numbered List', description: 'Ordered list', execute: e => e?.chain().focus().toggleOrderedList().run() },
  { title: 'Task List', description: 'Checkboxes', execute: e => e?.chain().focus().toggleTaskList().run() },
  { title: 'Quote', description: 'Blockquote', execute: e => e?.chain().focus().toggleBlockquote().run() },
  { title: 'Code Block', description: 'Code snippet', execute: e => e?.chain().focus().toggleCodeBlock().run() },
  { title: 'Divider', description: 'Horizontal rule', execute: e => e?.chain().focus().setHorizontalRule().run() },
]

interface SlashMenuState {
  items: SlashCommandItem[]
  selectedIndex: number
  rect: DOMRect | null
  command: (item: SlashCommandItem) => void
}

type SlashMenuSetter = React.Dispatch<React.SetStateAction<SlashMenuState | null>>

// latestSlashState is a module-level mutable cell so the keydown handler can read
// current state synchronously without a stale closure.
let _latestSlashState: SlashMenuState | null = null

function buildSlashCommandsExtension(setState: SlashMenuSetter) {
  return Extension.create({
    name: 'slashCommands',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          allowSpaces: false,
          startOfLine: false,
          command({ editor, range, props }) {
            editor.chain().focus().deleteRange(range).run()
            ;(props as SlashCommandItem).execute(editor)
          },
          items({ query }) {
            const q = query.toLowerCase()
            return SLASH_COMMANDS.filter(
              c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
            )
          },
          render() {
            return {
              onStart(props) {
                const next: SlashMenuState = {
                  items: props.items as SlashCommandItem[],
                  selectedIndex: 0,
                  rect: props.clientRect?.() ?? null,
                  command: item => props.command(item),
                }
                _latestSlashState = next
                setState(next)
              },
              onUpdate(props) {
                setState(prev => {
                  if (!prev) return prev
                  const next: SlashMenuState = {
                    ...prev,
                    items: props.items as SlashCommandItem[],
                    selectedIndex: 0,
                    rect: props.clientRect?.() ?? null,
                    command: item => props.command(item),
                  }
                  _latestSlashState = next
                  return next
                })
              },
              onKeyDown({ event }) {
                const s = _latestSlashState
                if (!s || s.items.length === 0) return false
                if (event.key === 'ArrowUp') {
                  setState(prev => {
                    if (!prev) return prev
                    const next = { ...prev, selectedIndex: (prev.selectedIndex - 1 + prev.items.length) % prev.items.length }
                    _latestSlashState = next
                    return next
                  })
                  return true
                }
                if (event.key === 'ArrowDown') {
                  setState(prev => {
                    if (!prev) return prev
                    const next = { ...prev, selectedIndex: (prev.selectedIndex + 1) % prev.items.length }
                    _latestSlashState = next
                    return next
                  })
                  return true
                }
                if (event.key === 'Enter') {
                  s.command(s.items[s.selectedIndex])
                  return true
                }
                if (event.key === 'Escape') {
                  _latestSlashState = null
                  setState(null)
                  return true
                }
                return false
              },
              onExit() {
                _latestSlashState = null
                setState(null)
              },
            }
          },
        }),
      ]
    },
  })
}

// ---- Slash Menu Component ----------------------------------------------------------

function SlashCommandMenu({ state }: { state: SlashMenuState | null }) {
  if (!state || state.items.length === 0) return null

  const top = (state.rect?.bottom ?? 0) + 6
  const left = state.rect?.left ?? 0

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 1000,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        padding: 'var(--space-1)',
        minWidth: 220,
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {state.items.map((item, i) => (
        <button
          key={item.title}
          onMouseDown={e => {
            e.preventDefault()
            state.command(item)
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            textAlign: 'left',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: i === state.selectedIndex ? 'var(--bg-surface-hover)' : 'transparent',
            gap: 2,
            transition: 'background var(--duration-fast) ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = i === state.selectedIndex ? 'var(--bg-surface-hover)' : 'transparent' }}
        >
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>
            {item.title}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {item.description}
          </span>
        </button>
      ))}
    </div>
  )
}

// ---- Bubble Menu Component ---------------------------------------------------------

function EditorBubbleMenu({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-mono)',
    color: active ? 'var(--text-accent)' : 'var(--text-secondary)',
    background: active ? 'var(--selection-bg)' : 'transparent',
    transition: 'all var(--duration-fast) ease',
  })

  return (
    <BubbleMenu
      editor={editor}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 'var(--space-1)',
      }}
    >
      <button
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
        style={btnStyle(editor.isActive('bold'))}
        title="Bold (⌘B)"
      >
        <strong>B</strong>
      </button>
      <button
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
        style={btnStyle(editor.isActive('italic'))}
        title="Italic (⌘I)"
      >
        <em>I</em>
      </button>
      <button
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }}
        style={btnStyle(editor.isActive('strike'))}
        title="Strikethrough"
      >
        <s>S</s>
      </button>
      <button
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run() }}
        style={btnStyle(editor.isActive('code'))}
        title="Inline code"
      >
        {'<>'}
      </button>
      <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />
      <button
        onMouseDown={e => {
          e.preventDefault()
          const url = window.prompt('URL')
          if (url) editor.chain().focus().setLink({ href: url }).run()
          else editor.chain().focus().unsetLink().run()
        }}
        style={btnStyle(editor.isActive('link'))}
        title="Link"
      >
        ↗
      </button>
    </BubbleMenu>
  )
}

// ---- Time formatting ---------------------------------------------------------------

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

// ---- Main NoteEditor component (shell - handles loading state) ---------------------

interface NoteEditorTipTapProps {
  noteId: string | null
  onBack: () => void
  onDeleted: () => void
}

export function NoteEditorTipTap({ noteId, onBack, onDeleted }: NoteEditorTipTapProps) {
  const existingNote = useLiveQuery(
    () => (noteId ? db.notes.get(noteId) : undefined),
    [noteId],
  )

  if (noteId && !existingNote) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
      }}>
        Loading...
      </div>
    )
  }

  return (
    <NoteEditorInner
      key={noteId ?? '__new__'}
      initialNote={existingNote ?? null}
      onBack={onBack}
      onDeleted={onDeleted}
    />
  )
}

// ---- Inner editor (has stable key, so TipTap re-mounts per note) -------------------

function NoteEditorInner({ initialNote, onBack, onDeleted }: {
  initialNote: Note | null
  onBack: () => void
  onDeleted: () => void
}) {
  const [kind, setKind] = useState<'thought' | 'source'>(initialNote?.kind ?? 'thought')
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(initialNote?.id ?? null)
  const [revisionCount, setRevisionCount] = useState(initialNote?.revisionCount ?? 0)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMac = navigator.platform.includes('Mac')

  // Slash menu state (proper React state; setter is stable so safe in useMemo)
  const [slashMenuState, setSlashMenuState] = useState<SlashMenuState | null>(null)

  const kindRef = useRef(kind)
  const currentNoteIdRef = useRef(currentNoteId)
  const revisionCountRef = useRef(revisionCount)

  // Keep refs in sync with state (via useEffect to satisfy React Compiler)
  useEffect(() => { kindRef.current = kind }, [kind])
  useEffect(() => { currentNoteIdRef.current = currentNoteId }, [currentNoteId])
  useEffect(() => { revisionCountRef.current = revisionCount }, [revisionCount])

  const slashCommandsExtension = useMemo(
    () => buildSlashCommandsExtension(setSlashMenuState),
    // setSlashMenuState is stable (from useState), empty deps is intentional
     
    [],
  )

  const save = useCallback(async (markdown: string, k: 'thought' | 'source') => {
    if (!markdown.trim()) return
    const now = new Date().toISOString()
    const id = currentNoteIdRef.current

    if (id) {
      const newRev = revisionCountRef.current + 1
      await db.notes.update(id, {
        contentMd: markdown.trim(), kind: k, updatedAt: now,
        revisionCount: newRev,
      })
      revisionCountRef.current = newRev
      setRevisionCount(newRev)
      runAgentPipeline(id)
    } else {
      const newId = crypto.randomUUID()
      const note: Note = {
        id: newId, regionId: null, kind: k, contentMd: markdown.trim(),
        style: null, intent: null, completionState: null, domain: null,
        graphX: Math.random() * 800 - 400, graphY: Math.random() * 600 - 300,
        placementRationale: null, revisionCount: 0, importSource: null,
        archivedAt: null, embedding: null, contentHash: null,
        createdAt: now, updatedAt: now,
      }
      await db.notes.add(note)
      currentNoteIdRef.current = newId
      setCurrentNoteId(newId)
      runAgentPipeline(newId)
    }
    setLastSaved(now)
  }, [setLastSaved, setCurrentNoteId, setRevisionCount])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: { depth: 100 } }),
      Markdown.configure({ transformPastedText: true }),
      Placeholder.configure({ placeholder: 'Begin writing... (type / for commands)' }),
      Typography,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      GlobalDragHandle.configure({ dragHandleWidth: 20 }),
      slashCommandsExtension,
    ],
    content: initialNote?.contentMd ?? '',
    autofocus: true,
    onUpdate({ editor }) {
      const markdown = getMarkdown(editor)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => save(markdown, kindRef.current), 800)
    },
  })

  // Cmd+S immediate save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (!editor) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        save(getMarkdown(editor), kindRef.current)
      }
      if (e.key === 'Escape' && !_latestSlashState) {
        onBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor, save, onBack])

  const handleKindChange = useCallback((k: 'thought' | 'source') => {
    setKind(k)
    kindRef.current = k
    if (!editor) return
    const markdown = getMarkdown(editor)
    if (markdown.trim()) save(markdown, k)
  }, [editor, save])

  const handleArchive = useCallback(async () => {
    const id = currentNoteIdRef.current
    if (!id) return
    const note = await db.notes.get(id)
    if (!note) return
    await db.notes.update(id, { archivedAt: note.archivedAt ? null : new Date().toISOString() })
    onBack()
  }, [onBack])

  const handleDelete = useCallback(async () => {
    const id = currentNoteIdRef.current
    if (!id) return
    if (!confirm('Permanently delete this note? This cannot be undone.')) return
    await db.transaction('rw', [db.notes, db.edges], async () => {
      await db.edges.filter(e => e.srcNoteId === id || e.dstNoteId === id).delete()
      await db.notes.delete(id)
    })
    onDeleted()
  }, [onDeleted])

  const wordCount = editor ? editor.storage.characterCount.words() : 0
  const savedAgo = lastSaved ? formatTimeAgo(lastSaved) : null

  return (
    <div className="fade-in" style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-write)',
    }}>
      {/* Top bar */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-5)',
        borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
              fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
              padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-md)',
              transition: 'color var(--duration-fast) ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />
          {(['thought', 'source'] as const).map(k => (
            <button
              key={k}
              onClick={() => handleKindChange(k)}
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 500, textTransform: 'uppercase',
                letterSpacing: '0.07em', padding: 'var(--space-1) var(--space-3)',
                borderRadius: 'var(--radius-full)',
                background: kind === k ? 'var(--selection-bg)' : 'transparent',
                color: kind === k ? 'var(--text-accent)' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)', transition: 'all var(--duration-fast) ease',
              }}
            >
              {k}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          {savedAgo && (
            <span style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}>
              saved {savedAgo}
            </span>
          )}
          {wordCount > 0 && (
            <span style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {wordCount}w
            </span>
          )}
          {currentNoteId && (
            <>
              <button
                onClick={handleArchive}
                style={{
                  fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-md)',
                  transition: 'color var(--duration-fast) ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
              >
                archive
              </button>
              <button
                onClick={handleDelete}
                style={{
                  fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-md)',
                  transition: 'color var(--duration-fast) ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-contradicts)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
              >
                delete
              </button>
            </>
          )}
        </div>
      </header>

      {/* Editor area */}
      <div style={{
        flex: 1, display: 'flex', justifyContent: 'center',
        overflowY: 'auto', padding: 'var(--space-8) var(--space-6)',
        position: 'relative',
      }}>
        <div style={{ width: '100%', maxWidth: 680 }}>
          {editor && <EditorBubbleMenu editor={editor} />}
          <EditorContent editor={editor} className="tiptap-editor" />
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        padding: 'var(--space-3) var(--space-6)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)', opacity: 0.7,
        }}>
          / for commands &middot; select text for formatting &middot; {isMac ? '⌘' : 'Ctrl'}+S to save
        </span>
      </footer>

      {/* Slash command menu (portal-free, fixed position) */}
      <SlashCommandMenu state={slashMenuState} />
    </div>
  )
}
