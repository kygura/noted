import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge as RFEdge,
  type NodeProps,
  type NodeChange,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { embedText } from '@/lib/search'
import {
  assignRegionsInBatch,
  regenerateEmbedding,
  regenerateEmbeddings,
  reclusterNotes,
  removeRegion,
  runAgentPipeline,
} from '@/lib/agent'
import { seedLayout, regionColor, CARD_W, CARD_H } from '@/lib/layout'
import { MapContextMenu, type MenuItem } from '@/components/MapContextMenu'
import type { Note, Region } from '@/types'

interface MapViewProps {
  onOpenNote: (id: string) => void
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const d = Math.sqrt(magA) * Math.sqrt(magB)
  return d === 0 ? 0 : dot / d
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`[^`]+`/g, m => m.slice(1, -1))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getTitle(md: string): string {
  return md.split('\n')[0].replace(/^#{1,6}\s*/, '').trim()
}

function getPreview(md: string, maxLen = 220): string {
  const stripped = stripMarkdown(md)
  const lines = stripped.split('\n').filter(l => l.trim()).slice(0, 6)
  const text = lines.join(' ').replace(/\s+/g, ' ').trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

interface BatchState {
  phase: 'embedding' | 'clustering' | 'regenerating'
  done: number
  total: number
}

interface NoteNodeData extends Record<string, unknown> {
  note: Note
  opacity: number
  isFocused: boolean
  onOpen: (id: string) => void
}

function NoteCardNode({ id, data }: NodeProps<Node<NoteNodeData>>) {
  const { note, opacity, isFocused, onOpen } = data
  const hasHeading = note.contentMd.trimStart().startsWith('#')
  const title = useMemo(() => getTitle(note.contentMd), [note.contentMd])
  const preview = useMemo(() => getPreview(note.contentMd), [note.contentMd])

  return (
    <div
      onDoubleClick={() => onOpen(id)}
      style={{
        width: CARD_W,
        height: CARD_H,
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        background: 'var(--bg-surface)',
        border: `1px solid ${isFocused ? 'var(--text-accent)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: isFocused ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        opacity,
        cursor: 'grab',
        overflow: 'hidden',
        textAlign: 'left',
        transition: 'opacity var(--duration-normal) ease, border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease',
      }}
    >
      {hasHeading && (
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-base)',
          fontWeight: 500,
          color: 'var(--text-primary)',
          lineHeight: 1.2,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          flexShrink: 0,
        }}>
          {title}
        </div>
      )}
      <div style={{
        fontSize: 'var(--text-xs)',
        color: hasHeading ? 'var(--text-secondary)' : 'var(--text-primary)',
        lineHeight: 1.55,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: hasHeading ? 5 : 6,
        WebkitBoxOrient: 'vertical',
        fontFamily: 'var(--font-body)',
        flex: 1,
      }}>
        {preview}
      </div>
      {!note.embedding && (
        <div style={{
          fontSize: '0.625rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-tertiary)',
          opacity: 0.55,
          flexShrink: 0,
        }}>
          no embedding
        </div>
      )}
    </div>
  )
}

const nodeTypes = { noteCard: NoteCardNode }

interface RegionZone {
  regionId: string | null
  name: string
  x: number
  y: number
  w: number
  h: number
  noteCount: number
}

interface CtxMenuState {
  x: number
  y: number
  title?: string
  items: MenuItem[]
}

function MapViewInner({ onOpenNote }: MapViewProps) {
  const { fitView } = useReactFlow()
  const notesRaw = useLiveQuery(() =>
    db.notes.filter(n => n.archivedAt === null).toArray()
  )
  const notes = useMemo(() => notesRaw ?? [], [notesRaw])

  const regionsRaw = useLiveQuery(() => db.regions.toArray())
  const regions = useMemo(() => regionsRaw ?? [], [regionsRaw])

  const [batchState, setBatchState] = useState<BatchState | null>(null)
  const [query, setQuery] = useState('')
  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<CtxMenuState | null>(null)
  // Transient position overrides from in-progress drags; cleared on drag end (DB becomes truth)
  const [dragPositions, setDragPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [dark, setDark] = useState(isDarkTheme())

  const queryRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const batchRanRef = useRef(false)
  const positionsSeededRef = useRef(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Watch theme changes
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Initial batch embed + cluster
  useEffect(() => {
    if (batchRanRef.current) return
    batchRanRef.current = true
    let cancelled = false

    async function runBatch() {
      const settings = await db.settings.get('app')
      const key = settings?.openaiApiKey
      if (!key) return

      const allNotes = await db.notes.filter(n => n.archivedAt === null).toArray()
      const needsEmbedding = allNotes.filter(n => !n.embedding)

      if (needsEmbedding.length > 0) {
        setBatchState({ phase: 'embedding', done: 0, total: needsEmbedding.length })
        for (let i = 0; i < needsEmbedding.length; i++) {
          if (cancelled) return
          try {
            const embedding = await embedText(needsEmbedding[i].contentMd, key)
            await db.notes.update(needsEmbedding[i].id, { embedding })
          } catch { /* skip */ }
          if (!cancelled) setBatchState({ phase: 'embedding', done: i + 1, total: needsEmbedding.length })
        }
      }

      if (cancelled) return

      const refreshed = await db.notes.filter(n => n.archivedAt === null).toArray()
      const needsRegion = refreshed.filter(n => n.embedding && !n.regionId).map(n => n.id)

      if (needsRegion.length > 0) {
        if (!cancelled) setBatchState({ phase: 'clustering', done: 0, total: 1 })
        await assignRegionsInBatch(needsRegion)
        if (!cancelled) setBatchState({ phase: 'clustering', done: 1, total: 1 })
      }

      if (!cancelled) setBatchState(null)
    }

    runBatch().catch(console.error)
    return () => { cancelled = true }
  }, [])

  // Query debounce → embed query
  const runQuery = useCallback(async (q: string) => {
    if (!q.trim()) { setQueryEmbedding(null); setQueryLoading(false); return }
    try {
      const settings = await db.settings.get('app')
      const key = settings?.openaiApiKey
      if (key) {
        const emb = await embedText(q, key)
        setQueryEmbedding(emb)
      }
    } catch { /* silent */ } finally {
      setQueryLoading(false)
    }
  }, [])

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val)
    if (!val.trim()) {
      setQueryEmbedding(null)
      setQueryLoading(false)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    setQueryLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runQuery(val), 400)
  }, [runQuery])

  // Per-note query scores
  const noteScores = useMemo((): Map<string, number> | null => {
    if (!queryEmbedding || !query.trim()) return null
    const scores = new Map<string, number>()
    for (const note of notes) {
      scores.set(note.id, note.embedding ? cosineSimilarity(note.embedding, queryEmbedding) : 0)
    }
    return scores
  }, [notes, queryEmbedding, query])

  // Seed positions for any notes missing them
  useEffect(() => {
    if (notes.length === 0) return
    if (positionsSeededRef.current) return
    const anyMissing = notes.some(n => n.graphX === 0 && n.graphY === 0)
    if (!anyMissing) { positionsSeededRef.current = true; return }
    positionsSeededRef.current = true

    const { positions } = seedLayout(notes)
    ;(async () => {
      for (const [id, pos] of positions) {
        const n = notes.find(x => x.id === id)
        if (n && n.graphX === 0 && n.graphY === 0) {
          await db.notes.update(id, { graphX: pos.x, graphY: pos.y })
        }
      }
    })().catch(console.error)
  }, [notes])

  // Build region zones from current note positions
  const regionZones = useMemo((): RegionZone[] => {
    const regionMap = new Map(regions.map(r => [r.id, r]))
    const byRegion = new Map<string | null, Note[]>()
    for (const n of notes) {
      const k = n.regionId ?? null
      if (!byRegion.has(k)) byRegion.set(k, [])
      byRegion.get(k)!.push(n)
    }

    const zones: RegionZone[] = []
    for (const [key, groupNotes] of byRegion) {
      if (key === null) continue
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const n of groupNotes) {
        minX = Math.min(minX, n.graphX)
        minY = Math.min(minY, n.graphY)
        maxX = Math.max(maxX, n.graphX + CARD_W)
        maxY = Math.max(maxY, n.graphY + CARD_H)
      }
      if (!isFinite(minX)) continue
      const pad = 28
      zones.push({
        regionId: key,
        name: regionMap.get(key)?.name ?? 'Unknown',
        x: minX - pad,
        y: minY - pad - 32,
        w: (maxX - minX) + pad * 2,
        h: (maxY - minY) + pad * 2 + 32,
        noteCount: groupNotes.length,
      })
    }
    return zones
  }, [notes, regions])

  // Derive nodes from notes + drag overlay (no setState-in-effect)
  const nodes = useMemo<Node<NoteNodeData>[]>(() => {
    const hasActiveQuery = !!query.trim() && !!queryEmbedding
    return notes.map(note => {
      const score = noteScores?.get(note.id) ?? null
      let opacity = 1
      if (hasActiveQuery && score !== null) {
        if (score < 0.15) opacity = 0.18
        else if (score > 0.5) opacity = 1
        else opacity = 0.3 + ((score - 0.15) / 0.35) * 0.7
      }
      const drag = dragPositions.get(note.id)
      const position = drag ?? { x: note.graphX || 0, y: note.graphY || 0 }
      return {
        id: note.id,
        type: 'noteCard',
        position,
        data: {
          note,
          opacity: Math.max(0, Math.min(1, opacity)),
          isFocused: focusedNodeId === note.id,
          onOpen: onOpenNote,
        },
        draggable: true,
      }
    })
  }, [notes, noteScores, focusedNodeId, query, queryEmbedding, onOpenNote, dragPositions])

  const persistPositions = useCallback((positions: Map<string, { x: number; y: number }>) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(async () => {
      for (const [id, pos] of positions) {
        await db.notes.update(id, { graphX: pos.x, graphY: pos.y })
      }
      // Clear transient overlay once DB has the values
      setDragPositions(prev => {
        const next = new Map(prev)
        for (const id of positions.keys()) next.delete(id)
        return next
      })
    }, 350)
  }, [])

  const onNodesChange = useCallback((changes: NodeChange<Node<NoteNodeData>>[]) => {
    const positionChanges = changes.filter(c => c.type === 'position') as Array<{
      id: string
      position?: { x: number; y: number }
      dragging?: boolean
    }>
    if (positionChanges.length === 0) return

    const applied = applyNodeChanges(changes, nodes)
    setDragPositions(prev => {
      const next = new Map(prev)
      for (const c of positionChanges) {
        const n = applied.find(x => x.id === c.id)
        if (n) next.set(c.id, n.position)
      }
      return next
    })

    const settled = positionChanges.filter(c => c.dragging === false)
    if (settled.length > 0) {
      const persistMap = new Map<string, { x: number; y: number }>()
      for (const c of settled) {
        const n = applied.find(x => x.id === c.id)
        if (n) persistMap.set(c.id, n.position)
      }
      persistPositions(persistMap)
    }
  }, [nodes, persistPositions])

  // ──────────────────────────────────────────────────────────────
  // Context menu handlers
  // ──────────────────────────────────────────────────────────────
  const closeMenu = useCallback(() => setContextMenu(null), [])

  const refreshLayout = useCallback(async () => {
    const all = await db.notes.filter(n => n.archivedAt === null).toArray()
    const { positions } = seedLayout(all)
    for (const [id, pos] of positions) {
      await db.notes.update(id, { graphX: pos.x, graphY: pos.y })
    }
    setTimeout(() => fitView({ duration: 400, padding: 0.1 }), 50)
  }, [fitView])

  const buildNoteMenu = useCallback((note: Note): MenuItem[] => [
    { label: 'Open note', onClick: () => onOpenNote(note.id) },
    { separator: true, label: '', onClick: () => {} },
    {
      label: 'Regenerate embedding',
      onClick: async () => {
        setBatchState({ phase: 'regenerating', done: 0, total: 1 })
        await regenerateEmbedding(note.id)
        setBatchState(null)
      },
    },
    {
      label: 'Re-run agent (edges + region)',
      onClick: async () => {
        setBatchState({ phase: 'regenerating', done: 0, total: 1 })
        await db.notes.update(note.id, { contentHash: null, regionId: null })
        await runAgentPipeline(note.id)
        setBatchState(null)
      },
    },
    {
      label: note.regionId ? 'Remove from region' : 'Not in a region',
      disabled: !note.regionId,
      onClick: async () => {
        await db.notes.update(note.id, { regionId: null, domain: null })
      },
    },
    { separator: true, label: '', onClick: () => {} },
    {
      label: note.archivedAt ? 'Unarchive' : 'Archive note',
      onClick: async () => {
        await db.notes.update(note.id, {
          archivedAt: note.archivedAt ? null : new Date().toISOString(),
        })
      },
      danger: !note.archivedAt,
    },
  ], [onOpenNote])

  const buildRegionMenu = useCallback((region: Region, memberIds: string[]): MenuItem[] => [
    {
      label: 'Rename region',
      onClick: async () => {
        const next = prompt('Region name', region.name)?.trim()
        if (!next || next === region.name) return
        await db.regions.update(region.id, { name: next, renamedAt: new Date().toISOString() })
        await db.notes.where('regionId').equals(region.id).modify({ domain: next })
      },
    },
    {
      label: `Regenerate embeddings (${memberIds.length})`,
      disabled: memberIds.length === 0,
      onClick: async () => {
        setBatchState({ phase: 'regenerating', done: 0, total: memberIds.length })
        await regenerateEmbeddings(memberIds, (done, total) =>
          setBatchState({ phase: 'regenerating', done, total }))
        setBatchState(null)
      },
    },
    {
      label: 'Re-cluster these notes',
      disabled: memberIds.length === 0,
      onClick: async () => {
        setBatchState({ phase: 'clustering', done: 0, total: 1 })
        await reclusterNotes(memberIds)
        setBatchState(null)
      },
    },
    { separator: true, label: '', onClick: () => {} },
    {
      label: 'Delete region (keep notes)',
      danger: true,
      onClick: async () => {
        await removeRegion(region.id)
      },
    },
  ], [])

  const buildPaneMenu = useCallback((): MenuItem[] => [
    {
      label: 'Regenerate all stale embeddings',
      onClick: async () => {
        const stale = notes.filter(n => !n.embedding).map(n => n.id)
        if (stale.length === 0) return
        setBatchState({ phase: 'regenerating', done: 0, total: stale.length })
        await regenerateEmbeddings(stale, (done, total) =>
          setBatchState({ phase: 'regenerating', done, total }))
        setBatchState(null)
      },
    },
    {
      label: 'Re-cluster unclustered notes',
      onClick: async () => {
        const targets = notes.filter(n => n.embedding && !n.regionId).map(n => n.id)
        if (targets.length === 0) return
        setBatchState({ phase: 'clustering', done: 0, total: 1 })
        await assignRegionsInBatch(targets)
        setBatchState(null)
      },
    },
    {
      label: 'Re-cluster ALL notes',
      onClick: async () => {
        const targets = notes.filter(n => n.embedding).map(n => n.id)
        if (targets.length === 0) return
        setBatchState({ phase: 'clustering', done: 0, total: 1 })
        await reclusterNotes(targets)
        setBatchState(null)
      },
    },
    { separator: true, label: '', onClick: () => {} },
    { label: 'Reset layout', onClick: refreshLayout },
    { label: 'Fit view', onClick: () => fitView({ duration: 300, padding: 0.1 }) },
  ], [notes, refreshLayout, fitView])

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node<NoteNodeData>) => {
    e.preventDefault()
    const note = node.data.note
    setFocusedNodeId(note.id)
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: getTitle(note.contentMd).slice(0, 60) || 'Untitled',
      items: buildNoteMenu(note),
    })
  }, [buildNoteMenu])

  const handlePaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    setContextMenu({
      x: 'clientX' in e ? e.clientX : 0,
      y: 'clientY' in e ? e.clientY : 0,
      title: 'Canvas',
      items: buildPaneMenu(),
    })
  }, [buildPaneMenu])

  const handleZoneContextMenu = useCallback((e: React.MouseEvent, zone: RegionZone) => {
    e.preventDefault()
    e.stopPropagation()
    if (!zone.regionId) return
    const region = regions.find(r => r.id === zone.regionId)
    if (!region) return
    const memberIds = notes.filter(n => n.regionId === zone.regionId).map(n => n.id)
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: `Region: ${region.name}`,
      items: buildRegionMenu(region, memberIds),
    })
  }, [regions, notes, buildRegionMenu])

  const handleNodeClick = useCallback((_e: React.MouseEvent, node: Node<NoteNodeData>) => {
    setFocusedNodeId(node.id)
  }, [])

  if (notes.length === 0) return <EmptyMap />

  const rfEdges: RFEdge[] = []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Query bar */}
      <div style={{
        padding: 'var(--space-3) var(--space-6)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        flexShrink: 0,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={query ? 'var(--text-accent)' : 'var(--text-tertiary)'}
          strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={queryRef}
          type="text"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Query a concept…"
          style={{
            flex: 1, fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)',
            color: 'var(--text-primary)', background: 'transparent',
          }}
        />
        {queryLoading && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            searching…
          </span>
        )}
        {query && !queryLoading && (
          <button
            onClick={() => { setQuery(''); setQueryEmbedding(null) }}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
          >
            clear
          </button>
        )}
        <button
          onClick={() => fitView({ duration: 300, padding: 0.1 })}
          style={{
            fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)', padding: '0 var(--space-2)',
          }}
        >
          fit
        </button>
        <button
          onClick={refreshLayout}
          style={{
            fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)', padding: '0 var(--space-2)',
          }}
        >
          reset layout
        </button>
      </div>

      {/* Batch progress banner */}
      {batchState && (
        <div style={{
          padding: 'var(--space-2) var(--space-6)',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)', flexShrink: 0,
        }}>
          <span>
            {batchState.phase === 'embedding' && 'generating embeddings'}
            {batchState.phase === 'clustering' && 'clustering notes'}
            {batchState.phase === 'regenerating' && 'regenerating embeddings'}
            …
          </span>
          <div style={{
            flex: 1, maxWidth: 180, height: 2,
            background: 'var(--border-subtle)', borderRadius: 999, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: batchState.total > 0 ? `${(batchState.done / batchState.total) * 100}%` : '0%',
              background: 'var(--text-accent)',
              transition: 'width 0.2s ease',
            }} />
          </div>
          <span style={{ opacity: 0.6 }}>{batchState.done}/{batchState.total}</span>
        </div>
      )}

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }} className="map-canvas">
        <ReactFlow
          nodes={nodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setFocusedNodeId(null)}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            color={dark ? 'rgba(227,220,203,0.06)' : 'rgba(28,23,16,0.06)'}
            gap={28}
            size={1}
          />
          <ZoneOverlay zones={regionZones} dark={dark} onZoneContextMenu={handleZoneContextMenu} />
          <Controls
            showInteractive={false}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-sm)',
            }}
          />
          <MiniMap
            pannable
            zoomable
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
            nodeColor={n => {
              const note = (n.data as NoteNodeData | undefined)?.note
              if (!note?.regionId) return dark ? '#444' : '#bbb'
              return regionColor(note.regionId, dark).label
            }}
            maskColor={dark ? 'rgba(16,14,10,0.6)' : 'rgba(246,241,233,0.6)'}
          />
        </ReactFlow>
      </div>

      {/* Hint bar */}
      <div style={{
        padding: 'var(--space-2) var(--space-6)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex', gap: 'var(--space-5)',
        fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)', flexShrink: 0, opacity: 0.55,
      }}>
        <span><Kbd>/</Kbd> query</span>
        <span>drag to pan, scroll to zoom</span>
        <span>double-click card to open</span>
        <span>right-click for actions</span>
      </div>

      {contextMenu && (
        <MapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          items={contextMenu.items}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

function ZoneOverlay({
  zones, dark, onZoneContextMenu,
}: {
  zones: RegionZone[]
  dark: boolean
  onZoneContextMenu: (e: React.MouseEvent, zone: RegionZone) => void
}) {
  // Anchor zones inside the React Flow viewport so they pan/zoom natively.
  // We attach as a sibling that mirrors the viewport's transform via a ref-based RAF
  // (no React state for transform — avoids setState-in-effect rerenders).
  const innerRef = useRef<HTMLDivElement>(null)
  const { getViewport } = useReactFlow()

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (innerRef.current) {
        const vp = getViewport()
        innerRef.current.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getViewport])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      <div
        ref={innerRef}
        style={{
          transformOrigin: '0 0',
          width: 0,
          height: 0,
        }}
      >
        {zones.map(zone => {
          const c = regionColor(zone.regionId, dark)
          return (
            <div
              key={zone.regionId ?? '__none__'}
              onContextMenu={e => onZoneContextMenu(e, zone)}
              style={{
                position: 'absolute',
                left: zone.x,
                top: zone.y,
                width: zone.w,
                height: zone.h,
                background: c.fill,
                border: `1px dashed ${c.stroke}`,
                borderRadius: 18,
                pointerEvents: 'auto',
                boxSizing: 'border-box',
              }}
            >
              <div style={{
                position: 'absolute',
                top: 6,
                left: 14,
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontStyle: 'italic',
                fontWeight: 400,
                letterSpacing: '-0.01em',
                color: c.label,
                lineHeight: 1.1,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                textShadow: dark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(255,255,255,0.6)',
              }}>
                {zone.name}
                <span style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontStyle: 'normal',
                  opacity: 0.6,
                }}>
                  {zone.noteCount}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MapView(props: MapViewProps) {
  return (
    <ReactFlowProvider>
      <MapViewInner {...props} />
    </ReactFlowProvider>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      padding: '0 0.3em',
      fontSize: '0.9em',
      marginRight: '0.25em',
    }}>
      {children}
    </kbd>
  )
}

function EmptyMap() {
  return (
    <div className="fade-in" style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
          color: 'var(--text-secondary)', fontWeight: 300, fontStyle: 'italic',
          marginBottom: 'var(--space-3)',
        }}>
          The map is empty
        </p>
        <p style={{
          fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
          maxWidth: 300, lineHeight: 1.6,
        }}>
          Write some notes and they will arrange themselves into semantic clusters.
        </p>
      </div>
    </div>
  )
}
