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

export async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embedding failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.data[0].embedding
}
