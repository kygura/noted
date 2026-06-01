import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '@/db'
import { embedTexts, EMBED_CHAR_LIMIT } from '@/lib/search'
import { assignRegionsInBatch, inferEdgesInBatch } from '@/lib/agent'
import type { Note } from '@/types'

// One request carries up to this many notes, capped by an estimated token
// budget so we stay comfortably under OpenAI's 300k-token-per-request ceiling
// and gentle on rate limits. ~4 chars/token → 400k chars ≈ 100k tokens.
const EMBED_BATCH_ITEMS = 100
const EMBED_BATCH_CHARS = 400_000

function* chunkForEmbedding(notes: Note[]): Generator<Note[]> {
  let chunk: Note[] = []
  let chars = 0
  for (const note of notes) {
    const len = Math.min(note.contentMd.length, EMBED_CHAR_LIMIT)
    if (chunk.length > 0 && (chunk.length >= EMBED_BATCH_ITEMS || chars + len > EMBED_BATCH_CHARS)) {
      yield chunk
      chunk = []
      chars = 0
    }
    chunk.push(note)
    chars += len
  }
  if (chunk.length > 0) yield chunk
}

export interface BatchState {
  phase: 'embedding' | 'clustering' | 'regenerating' | 'edges'
  done: number
  total: number
}

export interface EmbeddingBatchControls {
  state: BatchState | null
  paused: boolean
  hasApiKey: boolean | null
  runMissing: () => void
  rerunAll: () => void
  pause: () => void
  resume: () => void
  cancel: () => void
}

function hasFiniteEmbedding(embedding: number[] | null): embedding is number[] {
  return Array.isArray(embedding) && embedding.length > 0 && embedding.every(Number.isFinite)
}

function dominantEmbeddingDimension(notes: Note[]): number {
  const counts = new Map<number, number>()
  for (const note of notes) {
    if (!hasFiniteEmbedding(note.embedding)) continue
    counts.set(note.embedding.length, (counts.get(note.embedding.length) ?? 0) + 1)
  }

  let bestDim = 0
  let bestCount = 0
  for (const [dim, count] of counts) {
    if (count > bestCount || (count === bestCount && dim > bestDim)) {
      bestDim = dim
      bestCount = count
    }
  }
  return bestDim
}

function needsEmbedding(note: Note, expectedDim: number): boolean {
  return !hasFiniteEmbedding(note.embedding) || (expectedDim > 0 && note.embedding.length !== expectedDim)
}

/**
 * On mount, embed any notes missing an embedding and cluster any that lack a
 * region. Idempotent — safe to mount from multiple views. Returns batch
 * progress (or null when idle) for a progress banner. No-op without an API key.
 */
export function useEnsureEmbeddings(): EmbeddingBatchControls {
  const [batchState, setBatchState] = useState<BatchState | null>(null)
  const [paused, setPaused] = useState(false)
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const runIdRef = useRef(0)
  const pausedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const resumeWaitersRef = useRef<Array<() => void>>([])

  const releasePausedWaiters = useCallback(() => {
    const waiters = resumeWaitersRef.current
    resumeWaitersRef.current = []
    for (const resolve of waiters) resolve()
  }, [])

  const pause = useCallback(() => {
    if (!batchState) return
    pausedRef.current = true
    setPaused(true)
  }, [batchState])

  const resume = useCallback(() => {
    pausedRef.current = false
    setPaused(false)
    releasePausedWaiters()
  }, [releasePausedWaiters])

  const cancel = useCallback(() => {
    runIdRef.current++
    abortRef.current?.abort()
    abortRef.current = null
    pausedRef.current = false
    setPaused(false)
    setBatchState(null)
    releasePausedWaiters()
  }, [releasePausedWaiters])

  const stopWithoutStateUpdate = useCallback(() => {
    runIdRef.current++
    abortRef.current?.abort()
    abortRef.current = null
    pausedRef.current = false
    releasePausedWaiters()
  }, [releasePausedWaiters])

  const waitIfPaused = useCallback(async (runId: number): Promise<boolean> => {
    while (pausedRef.current) {
      await new Promise<void>(resolve => resumeWaitersRef.current.push(resolve))
      if (runId !== runIdRef.current) return false
    }
    return runId === runIdRef.current
  }, [])

  const runBatch = useCallback(async (mode: 'missing' | 'all') => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    abortRef.current?.abort()
    abortRef.current = null
    pausedRef.current = false
    setPaused(false)
    releasePausedWaiters()

    const settings = await db.settings.get('app')
    if (runId !== runIdRef.current) return
    const key = settings?.openaiApiKey
    setHasApiKey(!!key)
    if (!key) {
      setBatchState(null)
      return
    }

    const allNotes = await db.notes.filter(n => n.archivedAt === null).toArray()
    if (runId !== runIdRef.current) return
    const expectedDim = dominantEmbeddingDimension(allNotes)
    const targetNotes = mode === 'all'
      ? allNotes
      : allNotes.filter(note => needsEmbedding(note, expectedDim))

    if (targetNotes.length > 0) {
      const phase = mode === 'all' ? 'regenerating' : 'embedding'
      setBatchState({ phase, done: 0, total: targetNotes.length })

      let done = 0
      for (const chunk of chunkForEmbedding(targetNotes)) {
        if (!(await waitIfPaused(runId))) return

        const abortController = new AbortController()
        abortRef.current = abortController
        try {
          const embeddings = await embedTexts(chunk.map(n => n.contentMd), key, abortController.signal)
          if (runId !== runIdRef.current) return
          await db.notes.bulkUpdate(
            chunk.map((n, i) => ({ key: n.id, changes: { embedding: embeddings[i] } })),
          )
        } catch (error) {
          if (abortController.signal.aborted || runId !== runIdRef.current) return
          // Leave this chunk's notes unembedded; they still satisfy
          // needsEmbedding and get retried on the next mount.
          console.error('Embedding batch failed for chunk of', chunk.length, error)
        } finally {
          if (abortRef.current === abortController) abortRef.current = null
        }

        done += chunk.length
        if (runId === runIdRef.current) setBatchState({ phase, done, total: targetNotes.length })
      }
    }

    if (!(await waitIfPaused(runId))) return

    const refreshed = await db.notes.filter(n => n.archivedAt === null).toArray()
    if (runId !== runIdRef.current) return
    const needsRegion = refreshed.filter(n => hasFiniteEmbedding(n.embedding) && !n.regionId).map(n => n.id)

    if (needsRegion.length > 0) {
      setBatchState({ phase: 'clustering', done: 0, total: 1 })
      const abortController = new AbortController()
      abortRef.current = abortController
      await assignRegionsInBatch(needsRegion, abortController.signal)
      if (abortRef.current === abortController) abortRef.current = null
      if (abortController.signal.aborted) return
      if (runId !== runIdRef.current) return
      setBatchState({ phase: 'clustering', done: 1, total: 1 })
    }

    if (!(await waitIfPaused(runId))) return

    const needsEdges = refreshed.filter(n => hasFiniteEmbedding(n.embedding) && !n.contentHash).map(n => n.id)

    if (needsEdges.length > 0) {
      setBatchState({ phase: 'edges', done: 0, total: needsEdges.length })
      const abortController = new AbortController()
      abortRef.current = abortController
      await inferEdgesInBatch(needsEdges, abortController.signal, (edgeDone, edgeTotal) => {
        if (runId === runIdRef.current) setBatchState({ phase: 'edges', done: edgeDone, total: edgeTotal })
      })
      if (abortRef.current === abortController) abortRef.current = null
      if (abortController.signal.aborted) return
      if (runId !== runIdRef.current) return
    }

    if (runId === runIdRef.current) setBatchState(null)
  }, [releasePausedWaiters, waitIfPaused])

  const runMissing = useCallback(() => { void runBatch('missing') }, [runBatch])
  const rerunAll = useCallback(() => { void runBatch('all') }, [runBatch])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void runBatch('missing').catch(console.error)
    })
    return () => {
      active = false
      stopWithoutStateUpdate()
    }
  }, [runBatch, stopWithoutStateUpdate])

  return { state: batchState, paused, hasApiKey, runMissing, rerunAll, pause, resume, cancel }
}
