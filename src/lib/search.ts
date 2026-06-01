import { db } from '@/db'
import type { Note } from '@/types'

export interface SearchResult {
  note: Note
  literalScore: number
  semanticScore: number
  combinedScore: number
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

function literalScore(content: string, query: string): number {
  const lower = content.toLowerCase()
  const q = query.toLowerCase()
  if (!lower.includes(q)) return 0
  const words = q.split(/\s+/)
  let matched = 0
  for (const w of words) {
    if (lower.includes(w)) matched++
  }
  const wordScore = words.length > 0 ? matched / words.length : 0
  const exactBonus = lower.includes(q) ? 0.3 : 0
  const titleBonus = lower.split('\n')[0].includes(q) ? 0.2 : 0
  return Math.min(1, wordScore + exactBonus + titleBonus)
}

export async function searchLiteral(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return []
  const notes = await db.notes.filter(n => n.archivedAt === null).toArray()
  const results: SearchResult[] = []
  for (const note of notes) {
    const score = literalScore(note.contentMd, query)
    if (score > 0) {
      results.push({ note, literalScore: score, semanticScore: 0, combinedScore: score })
    }
  }
  return results.sort((a, b) => b.combinedScore - a.combinedScore)
}

export async function searchHybrid(
  query: string,
  queryEmbedding: number[],
): Promise<SearchResult[]> {
  if (!query.trim()) return []
  const notes = await db.notes.filter(n => n.archivedAt === null).toArray()
  const results: SearchResult[] = []
  for (const note of notes) {
    const lit = literalScore(note.contentMd, query)
    let sem = 0
    if (note.embedding && queryEmbedding.length > 0) {
      sem = Math.max(0, cosineSimilarity(note.embedding, queryEmbedding))
    }
    const combined = 0.4 * lit + 0.6 * sem
    if (combined > 0.05 || lit > 0) {
      results.push({ note, literalScore: lit, semanticScore: sem, combinedScore: combined })
    }
  }
  return results.sort((a, b) => b.combinedScore - a.combinedScore)
}

export const EMBED_CHAR_LIMIT = 8000

/**
 * Embed many texts in a single OpenAI request. The /v1/embeddings endpoint
 * accepts an array `input` (up to 2048 items / 300k tokens), so batching turns
 * N latency-bound round-trips into one. Results are returned in the same order
 * as `texts` — we sort by the response `index` since array order isn't
 * guaranteed. Transient 429/5xx responses are retried with backoff.
 */
export async function embedTexts(
  texts: string[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  if (texts.length === 0) return []
  const input = texts.map(t => t.slice(0, EMBED_CHAR_LIMIT))

  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input }),
    })

    if (res.ok) {
      const data = await res.json()
      const rows: Array<{ index: number; embedding: number[] }> = data.data
      return rows.slice().sort((a, b) => a.index - b.index).map(r => r.embedding)
    }

    // Retry rate limits / server errors; surface client errors immediately.
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000
      lastErr = new Error(`Embedding failed: ${res.status}`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
      continue
    }

    const err = await res.text()
    throw new Error(`Embedding failed: ${res.status} ${err}`)
  }
  throw lastErr ?? new Error('Embedding failed after retries')
}

export async function embedText(text: string, apiKey: string, signal?: AbortSignal): Promise<number[]> {
  const [embedding] = await embedTexts([text], apiKey, signal)
  return embedding
}
