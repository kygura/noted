import { useCallback, useRef, useState } from 'react'
import { db } from '@/db'
import { embedText } from '@/lib/search'

export interface ConceptQuery {
  query: string
  /** Update the query text; debounced embedding follows. */
  setQuery: (val: string) => void
  queryEmbedding: number[] | null
  loading: boolean
  clear: () => void
}

/**
 * A debounced "type a concept" query: text in, embedding out. Consumers score
 * notes against `queryEmbedding` (via cosineSimilarity) to highlight the map.
 */
export function useConceptQuery(debounceMs = 400): ConceptQuery {
  const [query, setQueryState] = useState('')
  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(async (q: string) => {
    if (!q.trim()) { setQueryEmbedding(null); setLoading(false); return }
    try {
      const settings = await db.settings.get('app')
      const key = settings?.openaiApiKey
      if (key) setQueryEmbedding(await embedText(q, key))
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  const setQuery = useCallback((val: string) => {
    setQueryState(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setQueryEmbedding(null); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => run(val), debounceMs)
  }, [run, debounceMs])

  const clear = useCallback(() => {
    setQueryState('')
    setQueryEmbedding(null)
    setLoading(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  return { query, setQuery, queryEmbedding, loading, clear }
}
