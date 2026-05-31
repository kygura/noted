/** Cosine similarity in [-1, 1]; 0 when either vector has zero magnitude. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const d = Math.sqrt(magA) * Math.sqrt(magB)
  return d === 0 ? 0 : dot / d
}
