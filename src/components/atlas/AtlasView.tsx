import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useEnsureEmbeddings } from '@/hooks/useEnsureEmbeddings'
import { useConceptQuery } from '@/hooks/useConceptQuery'
import { projectEmbeddings } from '@/lib/atlas/project'
import { settle } from '@/lib/atlas/simulate'
import { computeField, reliefContours, territoryOutlines } from '@/lib/atlas/field'
import { cosineSimilarity } from '@/lib/vector'
import { getTitle } from '@/lib/noteText'
import type { Vec2 } from '@/lib/atlas/types'
import { AtlasCanvas, type AtlasCanvasHandle, type AtlasNodeView, type RegionLabelView, type FocusEdgeView } from '@/components/atlas/AtlasCanvas'
import { QueryBar } from '@/components/atlas/QueryBar'
import { FocusCard } from '@/components/atlas/FocusCard'
import { Legend, type LegendRegion } from '@/components/atlas/Legend'
import { MapContextMenu, type MenuItem } from '@/components/MapContextMenu'
import { runAgentPipeline, regenerateEmbedding, assignRegionsInBatch } from '@/lib/agent'
import type { Note } from '@/types'

interface AtlasViewProps {
  onOpenNote: (id: string) => void
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function hasFiniteEmbedding(embedding: number[] | null): embedding is number[] {
  return Array.isArray(embedding) && embedding.length > 0 && embedding.every(Number.isFinite)
}

function useDark(): boolean {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  )
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.getAttribute('data-theme') === 'dark'))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function AtlasView({ onOpenNote }: AtlasViewProps) {
  const notesRaw = useLiveQuery(() => db.notes.filter(n => n.archivedAt === null).toArray())
  const notes = useMemo(() => notesRaw ?? [], [notesRaw])
  const atlasNotes = useDeferredValue(notes)
  const regionsRaw = useLiveQuery(() => db.regions.toArray())
  const regions = useMemo(() => regionsRaw ?? [], [regionsRaw])
  const edgesRaw = useLiveQuery(() => db.edges.toArray())
  const edges = useMemo(() => edgesRaw ?? [], [edgesRaw])

  const dark = useDark()
  const [reduceMotion] = useState(prefersReducedMotion)
  const {
    state: batchState,
    paused: embeddingPaused,
    hasApiKey,
    runMissing: runMissingEmbeddings,
    rerunAll: rerunAllEmbeddings,
    pause: pauseEmbeddings,
    resume: resumeEmbeddings,
    cancel: cancelEmbeddings,
  } = useEnsureEmbeddings()
  const { query, setQuery, queryEmbedding, loading, clear } = useConceptQuery()

  const [focusId, setFocusId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [gathering, setGathering] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; title?: string; items: MenuItem[] } | null>(null)

  const canvasRef = useRef<AtlasCanvasHandle>(null)

  // ── layout: PCA → force settle (recomputed when the note set changes) ──
  const basePositions = useMemo(() => {
    const projected = projectEmbeddings(atlasNotes.map(n => ({ id: n.id, embedding: n.embedding })))
    const input = [...projected].map(([id, pos]) => ({ id, pos }))
    return settle(input, { radius: 30 })
  }, [atlasNotes])

  // ── query scores ──────────────────────────────────────────────
  const scores = useMemo(() => {
    if (!queryEmbedding || !query.trim()) return null
    const m = new Map<string, number>()
    for (const n of atlasNotes) m.set(n.id, hasFiniteEmbedding(n.embedding) ? cosineSimilarity(n.embedding, queryEmbedding) : 0)
    return m
  }, [atlasNotes, queryEmbedding, query])

  const canGather = !!scores
  const activeGathering = gathering && canGather

  // ── gather-around-query: relevance phyllotaxis (relevant at centre) ──
  const gatherPositions = useMemo(() => {
    const m = new Map<string, Vec2>()
    if (!scores) return m
    const ranked = [...atlasNotes].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    ranked.forEach((n, i) => {
      const angle = i * GOLDEN_ANGLE
      const radius = Math.sqrt(i) * 46
      m.set(n.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    })
    return m
  }, [atlasNotes, scores])

  const positions = activeGathering ? gatherPositions : basePositions

  // ── derived geometry ──────────────────────────────────────────
  const nodeViews = useMemo<AtlasNodeView[]>(() =>
    atlasNotes.map(n => ({
      id: n.id,
      pos: positions.get(n.id) ?? { x: 0, y: 0 },
      regionId: n.regionId,
      title: getTitle(n.contentMd),
    })), [atlasNotes, positions])

  const field = useMemo(() =>
    activeGathering ? null : computeField(nodeViews.map(v => ({ id: v.id, regionId: v.regionId, pos: v.pos }))),
    [nodeViews, activeGathering])
  const territories = useMemo(() => (field ? territoryOutlines(field) : []), [field])
  const relief = useMemo(() => (field ? reliefContours(field, 6) : []), [field])

  const labels = useMemo<RegionLabelView[]>(() => {
    if (activeGathering) return []
    const acc = new Map<string, { sx: number; sy: number; n: number }>()
    for (const v of nodeViews) {
      if (v.regionId == null) continue
      const e = acc.get(v.regionId) ?? { sx: 0, sy: 0, n: 0 }
      e.sx += v.pos.x; e.sy += v.pos.y; e.n++
      acc.set(v.regionId, e)
    }
    const name = new Map(regions.map(r => [r.id, r.name]))
    return [...acc].map(([rid, e]) => ({
      regionId: rid, name: name.get(rid) ?? '', pos: { x: e.sx / e.n, y: e.sy / e.n },
    })).filter(l => l.name)
  }, [nodeViews, regions, activeGathering])

  const legendRegions = useMemo<LegendRegion[]>(() => {
    const counts = new Map<string | null, number>()
    for (const n of notes) counts.set(n.regionId, (counts.get(n.regionId) ?? 0) + 1)
    const name = new Map(regions.map(r => [r.id, r.name]))
    return [...counts]
      .filter(([rid]) => rid != null)
      .map(([rid, count]) => ({ regionId: rid, name: name.get(rid as string) ?? '—', count }))
      .sort((a, b) => b.count - a.count)
  }, [notes, regions])

  const focusEdges = useMemo<FocusEdgeView[]>(() => {
    if (!focusId) return []
    const res: FocusEdgeView[] = []
    for (const e of edges) {
      if (e.status === 'rejected') continue
      const other = e.srcNoteId === focusId ? e.dstNoteId : e.dstNoteId === focusId ? e.srcNoteId : null
      if (!other) continue
      const to = positions.get(other)
      if (to) res.push({ to, type: e.type })
    }
    return res
  }, [focusId, edges, positions])

  const focusNote = useMemo<Note | null>(() =>
    focusId ? notes.find(n => n.id === focusId) ?? null : null, [focusId, notes])

  const missingEmbeddingCount = useMemo(() =>
    notes.filter(n => !hasFiniteEmbedding(n.embedding)).length, [notes])

  // ── keyboard: arrows move focus, Tab cycles territories, Esc clears ──
  const moveFocus = useCallback((key: string) => {
    if (nodeViews.length === 0) return
    const cur = nodeViews.find(v => v.id === focusId)
    if (!cur) { const f = nodeViews[0]; setFocusId(f.id); canvasRef.current?.focusOn(f.pos); return }
    const dir = key === 'ArrowRight' ? { x: 1, y: 0 } : key === 'ArrowLeft' ? { x: -1, y: 0 }
      : key === 'ArrowUp' ? { x: 0, y: -1 } : { x: 0, y: 1 }
    let best: AtlasNodeView | null = null
    let bestScore = Infinity
    for (const v of nodeViews) {
      if (v.id === cur.id) continue
      const dx = v.pos.x - cur.pos.x, dy = v.pos.y - cur.pos.y
      const along = dx * dir.x + dy * dir.y
      if (along <= 0) continue
      const perp = Math.abs(dx * dir.y - dy * dir.x)
      const score = along + perp * 2
      if (score < bestScore) { bestScore = score; best = v }
    }
    if (best) { setFocusId(best.id); canvasRef.current?.focusOn(best.pos) }
  }, [nodeViews, focusId])

  const territoryIdx = useRef(-1)
  const cycleTerritory = useCallback((dir: number) => {
    if (labels.length === 0) return
    territoryIdx.current = (territoryIdx.current + dir + labels.length) % labels.length
    canvasRef.current?.focusOn(labels[territoryIdx.current].pos, 1.1)
  }, [labels])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (typing) return
      if (e.key === 'Escape') { setFocusId(null); setMenu(null); if (query) clear(); if (activeGathering) setGathering(false) }
      else if (e.key === 'Tab') { e.preventDefault(); cycleTerritory(e.shiftKey ? -1 : 1) }
      else if (e.key.startsWith('Arrow')) { e.preventDefault(); moveFocus(e.key) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [moveFocus, cycleTerritory, query, clear, activeGathering])

  // Reframe when entering/leaving gather mode.
  useEffect(() => {
    const id = setTimeout(() => canvasRef.current?.fit(), 30)
    return () => clearTimeout(id)
  }, [activeGathering])

  // ── context menus ─────────────────────────────────────────────
  const closeMenu = useCallback(() => setMenu(null), [])

  const handleContextMenu = useCallback((clientX: number, clientY: number, id: string | null) => {
    if (id) {
      const note = notes.find(n => n.id === id)
      if (!note) return
      setFocusId(id)
      setMenu({
        x: clientX, y: clientY,
        title: getTitle(note.contentMd).slice(0, 48) || 'Untitled',
        items: [
          { label: 'Open note', onClick: () => onOpenNote(id) },
          { separator: true, label: '', onClick: () => {} },
          { label: 'Regenerate embedding', onClick: () => { regenerateEmbedding(id) } },
          { label: 'Re-run agent (edges + region)', onClick: async () => { await db.notes.update(id, { contentHash: null }); runAgentPipeline(id) } },
          { separator: true, label: '', onClick: () => {} },
          { label: 'Archive note', danger: true, onClick: () => { db.notes.update(id, { archivedAt: new Date().toISOString() }); setFocusId(null) } },
        ],
      })
    } else {
      setMenu({
        x: clientX, y: clientY, title: 'Atlas',
        items: [
          { label: 'Fit view', onClick: () => canvasRef.current?.fit() },
          { label: `Embed missing notes (${missingEmbeddingCount})`, disabled: missingEmbeddingCount === 0, onClick: runMissingEmbeddings },
          { label: `Re-run all embeddings (${notes.length})`, disabled: notes.length === 0, onClick: rerunAllEmbeddings },
          {
            label: 'Re-cluster unclustered notes',
            onClick: () => {
              const targets = notes.filter(n => hasFiniteEmbedding(n.embedding) && !n.regionId).map(n => n.id)
              if (targets.length) assignRegionsInBatch(targets)
            },
          },
        ],
      })
    }
  }, [missingEmbeddingCount, notes, onOpenNote, rerunAllEmbeddings, runMissingEmbeddings])

  if (notes.length === 0) return <EmptyAtlas batching={!!batchState} />

  const hasEmbeddings = notes.some(n => hasFiniteEmbedding(n.embedding))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <QueryBar
        query={query} loading={loading} gathering={activeGathering} canGather={canGather}
        onChange={setQuery} onClear={clear}
        onToggleGather={() => setGathering(g => !g)}
        onFit={() => canvasRef.current?.fit()}
      />

      <EmbeddingControlBar
        state={batchState}
        paused={embeddingPaused}
        hasApiKey={hasApiKey}
        missingCount={missingEmbeddingCount}
        totalCount={notes.length}
        onRunMissing={runMissingEmbeddings}
        onRerunAll={rerunAllEmbeddings}
        onPause={pauseEmbeddings}
        onResume={resumeEmbeddings}
        onCancel={cancelEmbeddings}
      />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AtlasCanvas
          ref={canvasRef}
          nodes={nodeViews}
          territories={territories}
          relief={relief}
          labels={labels}
          dark={dark}
          focusId={focusId}
          hoverId={hoverId}
          focusEdges={focusEdges}
          scores={scores}
          reduceMotion={reduceMotion}
          onHover={setHoverId}
          onSelect={setFocusId}
          onOpen={onOpenNote}
          onBackground={() => setFocusId(null)}
          onContextMenu={handleContextMenu}
        />

        {!activeGathering && <Legend regions={legendRegions} dark={dark} onPick={(rid) => {
          const l = labels.find(x => x.regionId === rid)
          if (l) canvasRef.current?.focusOn(l.pos, 1.1)
        }} />}

        {focusNote && (
          <FocusCard
            note={focusNote}
            regionName={regions.find(r => r.id === focusNote.regionId)?.name ?? null}
            edgeCount={focusEdges.length}
            onOpen={() => onOpenNote(focusNote.id)}
            onRerun={async () => { await db.notes.update(focusNote.id, { contentHash: null }); runAgentPipeline(focusNote.id) }}
            onArchive={() => { db.notes.update(focusNote.id, { archivedAt: new Date().toISOString() }); setFocusId(null) }}
            onClose={() => setFocusId(null)}
          />
        )}
      </div>

      <div style={{
        padding: 'var(--space-2) var(--space-6)', borderTop: '1px solid var(--border-subtle)',
        display: 'flex', gap: 'var(--space-5)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)', flexShrink: 0, opacity: 0.55, flexWrap: 'wrap',
      }}>
        <span>drag to roam · scroll to zoom</span>
        <span>click a mote to focus · double-click to open</span>
        <span>↑↓←→ wander · tab: territories · esc: clear</span>
        {!hasEmbeddings && <span style={{ color: 'var(--text-accent)', opacity: 0.8 }}>add an OpenAI key in Settings to map by meaning</span>}
      </div>

      {menu && <MapContextMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={closeMenu} />}
    </div>
  )
}

function EmptyAtlas({ batching }: { batching: boolean }) {
  return (
    <div className="fade-in" style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--text-secondary)',
          fontWeight: 300, fontStyle: 'italic', marginBottom: 'var(--space-3)',
        }}>
          An empty country
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          {batching ? 'Charting your notes…' : 'Write some notes — they will settle into territories of meaning, and the land will draw itself.'}
        </p>
      </div>
    </div>
  )
}

interface EmbeddingControlBarProps {
  state: ReturnType<typeof useEnsureEmbeddings>['state']
  paused: boolean
  hasApiKey: boolean | null
  missingCount: number
  totalCount: number
  onRunMissing: () => void
  onRerunAll: () => void
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}

function EmbeddingControlBar({
  state,
  paused,
  hasApiKey,
  missingCount,
  totalCount,
  onRunMissing,
  onRerunAll,
  onPause,
  onResume,
  onCancel,
}: EmbeddingControlBarProps) {
  const active = state !== null
  const phaseLabel = state?.phase === 'embedding'
    ? 'mapping notes'
    : state?.phase === 'regenerating'
      ? 'rebuilding embeddings'
      : state?.phase === 'edges'
        ? 'tracing connections'
        : 'forming territories'
  const idleLabel = hasApiKey === false
    ? 'OpenAI key required for semantic mapping'
    : missingCount > 0
      ? `${missingCount} ${missingCount === 1 ? 'note needs' : 'notes need'} embeddings`
      : 'embeddings ready'

  return (
    <div style={{
      padding: 'var(--space-2) var(--space-6)', background: 'var(--bg-elevated)',
      borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center',
      gap: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
      fontFamily: 'var(--font-mono)', flexShrink: 0, flexWrap: 'wrap',
    }}>
      <span>{active ? `${phaseLabel}${paused ? ' paused' : '...'}` : idleLabel}</span>
      {state && (
        <>
          <div style={{ flex: '1 1 120px', maxWidth: 180, height: 2, background: 'var(--border-subtle)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: state.total > 0 ? `${(state.done / state.total) * 100}%` : '0%', background: 'var(--text-accent)', transition: 'width 0.2s ease' }} />
          </div>
          <span style={{ opacity: 0.6 }}>{state.done}/{state.total}</span>
        </>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto', flexWrap: 'wrap' }}>
        {active ? (
          <>
            <ControlButton onClick={paused ? onResume : onPause}>{paused ? 'resume' : 'pause'}</ControlButton>
            <ControlButton onClick={onCancel}>cancel</ControlButton>
          </>
        ) : (
          <>
            <ControlButton onClick={onRunMissing} disabled={hasApiKey === false || missingCount === 0}>embed missing</ControlButton>
            <ControlButton onClick={onRerunAll} disabled={hasApiKey === false || totalCount === 0}>rerun all</ControlButton>
          </>
        )}
      </div>
    </div>
  )
}

function ControlButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)',
        padding: '2px var(--space-3)', opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
