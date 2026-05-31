import { useEffect, useRef, useState } from 'react'
import { db } from '@/db'
import { embedText } from '@/lib/search'
import { assignRegionsInBatch } from '@/lib/agent'

export interface BatchState {
  phase: 'embedding' | 'clustering' | 'regenerating'
  done: number
  total: number
}

/**
 * On mount, embed any notes missing an embedding and cluster any that lack a
 * region. Idempotent — safe to mount from multiple views. Returns batch
 * progress (or null when idle) for a progress banner. No-op without an API key.
 */
export function useEnsureEmbeddings(): BatchState | null {
  const [batchState, setBatchState] = useState<BatchState | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    let cancelled = false

    async function run() {
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
          } catch { /* skip individual failures */ }
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

    run().catch(console.error)
    return () => { cancelled = true }
  }, [])

  return batchState
}
