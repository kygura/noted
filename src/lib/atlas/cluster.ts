export interface ClusterItem {
  id: string
  embedding: number[]
}

export interface Cluster {
  ids: string[]
  /** Unit-length mean direction of the cluster's members (cosine space). */
  centroid: number[]
}

export interface ClusterOptions {
  /** Seed for the deterministic k-means++ initialisation. */
  seed?: number
  /** Lloyd iteration cap. */
  maxIter?: number
}

/**
 * How many territories to carve a base of `n` notes into. Grows slowly and is
 * hard-capped at 8 so the atlas reads as a handful of unifying regions rather
 * than a confetti of tiny ones; tiny bases collapse to a single region.
 */
export function chooseK(n: number): number {
  if (n <= 0) return 0
  if (n < 4) return 1
  return Math.min(8, Math.max(2, Math.round(Math.sqrt(n / 2))))
}

function isFiniteEmbedding(embedding: number[] | null | undefined): embedding is number[] {
  return Array.isArray(embedding) && embedding.length > 0 && embedding.every(Number.isFinite)
}

function normalize(v: number[]): number[] {
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm)
  if (norm === 0) return v.slice()
  return v.map(x => x / norm)
}

function dot(a: number[], b: number[]): number {
  let s = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) s += a[i] * b[i]
  return s
}

/** Small, fast, seedable PRNG so cluster output is reproducible across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** k-means++ seeding on unit vectors, with cosine distance (1 − dot). */
function initCentroids(points: number[][], k: number, rng: () => number): number[][] {
  const n = points.length
  const centroids: number[][] = [points[Math.floor(rng() * n) % n].slice()]
  const best = new Array<number>(n).fill(Infinity)

  while (centroids.length < k) {
    const last = centroids[centroids.length - 1]
    let sum = 0
    for (let i = 0; i < n; i++) {
      const d = 1 - dot(points[i], last)
      if (d < best[i]) best[i] = d
      sum += best[i]
    }
    let r = rng() * sum
    let chosen = n - 1
    for (let i = 0; i < n; i++) {
      r -= best[i]
      if (r <= 0) { chosen = i; break }
    }
    centroids.push(points[chosen].slice())
  }
  return centroids
}

/**
 * Spherical k-means over note embeddings. Vectors are unit-normalised so
 * proximity is cosine similarity — the same notion the rest of the atlas uses.
 * Deterministic for a fixed seed. Items with malformed embeddings are dropped;
 * empty clusters are reseeded to the worst-fit point so `k` real groups emerge.
 * Returned clusters are non-empty and ordered largest-first (stable ties).
 */
export function clusterEmbeddings(items: ClusterItem[], k: number, opts: ClusterOptions = {}): Cluster[] {
  const valid = items.filter(it => isFiniteEmbedding(it.embedding))
  if (valid.length === 0 || k <= 0) return []

  const effK = Math.max(1, Math.min(k, valid.length))
  const points = valid.map(it => normalize(it.embedding))
  const dim = points[0].length
  const rng = mulberry32(opts.seed ?? 1)
  const maxIter = opts.maxIter ?? 50

  const centroids = initCentroids(points, effK, rng)
  const assign = new Array<number>(valid.length).fill(-1)

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestSim = -Infinity
      for (let c = 0; c < effK; c++) {
        const s = dot(points[i], centroids[c])
        if (s > bestSim) { bestSim = s; best = c }
      }
      if (assign[i] !== best) { assign[i] = best; changed = true }
    }

    const sums = Array.from({ length: effK }, () => new Array<number>(dim).fill(0))
    const counts = new Array<number>(effK).fill(0)
    for (let i = 0; i < points.length; i++) {
      const c = assign[i]
      counts[c]++
      const p = points[i]
      const s = sums[c]
      for (let d = 0; d < dim; d++) s[d] += p[d]
    }

    for (let c = 0; c < effK; c++) {
      if (counts[c] === 0) {
        // Steal the point that fits its current cluster worst.
        let worst = 0
        let worstSim = Infinity
        for (let i = 0; i < points.length; i++) {
          const s = dot(points[i], centroids[assign[i]])
          if (s < worstSim) { worstSim = s; worst = i }
        }
        centroids[c] = points[worst].slice()
      } else {
        centroids[c] = normalize(sums[c])
      }
    }

    if (!changed && iter > 0) break
  }

  const clusters: Cluster[] = Array.from({ length: effK }, (_, c) => ({ ids: [], centroid: centroids[c] }))
  for (let i = 0; i < valid.length; i++) clusters[assign[i]].ids.push(valid[i].id)

  return clusters
    .filter(c => c.ids.length > 0)
    .sort((a, b) => b.ids.length - a.ids.length || a.ids[0].localeCompare(b.ids[0]))
}
