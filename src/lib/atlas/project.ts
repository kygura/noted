import type { Vec2 } from './types'

export interface Projectable {
  id: string
  embedding: number[] | null
}

/** Deterministic seeded unit vector of length `dim` (avoids degenerate inits). */
function seededVector(dim: number): number[] {
  let s = 0x9e3779b9 ^ dim
  const v = new Array<number>(dim)
  let norm = 0
  for (let i = 0; i < dim; i++) {
    s = (s * 1664525 + 1013904223) | 0
    const r = ((s >>> 0) % 100000) / 100000 - 0.5
    v[i] = r
    norm += r * r
  }
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < dim; i++) v[i] /= norm
  return v
}

/** Fix the arbitrary sign of an eigenvector so projections are reproducible. */
function fixSign(v: number[]): number[] {
  let maxAbs = 0
  let idx = 0
  for (let i = 0; i < v.length; i++) {
    if (Math.abs(v[i]) > maxAbs) {
      maxAbs = Math.abs(v[i])
      idx = i
    }
  }
  return v[idx] < 0 ? v.map(x => -x) : v
}

/**
 * Top principal component of the centered rows via power iteration on the
 * covariance (implicitly, as Cv = Σ x (x·v)). `exclude` holds already-found
 * components to deflate against (Gram-Schmidt), yielding the next component.
 */
function principalComponent(centered: number[][], dim: number, exclude: number[][]): number[] {
  let v = seededVector(dim)
  // Orthogonalise the init against excluded components.
  for (const e of exclude) {
    let d = 0
    for (let j = 0; j < dim; j++) d += v[j] * e[j]
    for (let j = 0; j < dim; j++) v[j] -= d * e[j]
  }
  for (let iter = 0; iter < 80; iter++) {
    const u = new Array<number>(dim).fill(0)
    for (const x of centered) {
      let dot = 0
      for (let j = 0; j < dim; j++) dot += x[j] * v[j]
      for (let j = 0; j < dim; j++) u[j] += x[j] * dot
    }
    for (const e of exclude) {
      let d = 0
      for (let j = 0; j < dim; j++) d += u[j] * e[j]
      for (let j = 0; j < dim; j++) u[j] -= d * e[j]
    }
    let norm = 0
    for (let j = 0; j < dim; j++) norm += u[j] * u[j]
    norm = Math.sqrt(norm)
    if (norm < 1e-12) return fixSign(v) // no variance left
    let delta = 0
    for (let j = 0; j < dim; j++) {
      const nv = u[j] / norm
      delta += Math.abs(nv - v[j])
      v[j] = nv
    }
    if (delta < 1e-9) break
  }
  return fixSign(v)
}

/**
 * Project notes' high-dimensional embeddings into 2D via PCA (top-2 components).
 * Deterministic: identical input yields identical output, so the map is a
 * stable, learnable place. Notes lacking an embedding are placed on a
 * deterministic outer ring so they remain visible without distorting the cloud.
 */
export function projectEmbeddings(items: Projectable[]): Map<string, Vec2> {
  const result = new Map<string, Vec2>()
  if (items.length === 0) return result

  const withEmb = items.filter(it => it.embedding && it.embedding.length > 0)
  const dim = withEmb[0]?.embedding!.length ?? 0

  let cloudRadius = 1
  if (withEmb.length > 0) {
    // Mean-centre.
    const mean = new Array<number>(dim).fill(0)
    for (const it of withEmb) {
      const e = it.embedding!
      for (let j = 0; j < dim; j++) mean[j] += e[j]
    }
    for (let j = 0; j < dim; j++) mean[j] /= withEmb.length
    const centered = withEmb.map(it => {
      const e = it.embedding!
      const c = new Array<number>(dim)
      for (let j = 0; j < dim; j++) c[j] = e[j] - mean[j]
      return c
    })

    const pc1 = principalComponent(centered, dim, [])
    const pc2 = principalComponent(centered, dim, [pc1])

    let maxR = 0
    withEmb.forEach((it, i) => {
      const c = centered[i]
      let x = 0
      let y = 0
      for (let j = 0; j < dim; j++) {
        x += c[j] * pc1[j]
        y += c[j] * pc2[j]
      }
      result.set(it.id, { x, y })
      maxR = Math.max(maxR, Math.hypot(x, y))
    })
    cloudRadius = maxR || 1
  }

  // Place embedding-less notes on a deterministic ring just outside the cloud.
  const missing = items.filter(it => !it.embedding || it.embedding.length === 0)
  const ringR = cloudRadius * 1.25 + 1
  missing.forEach((it, i) => {
    const angle = (i * GOLDEN_ANGLE_RAD) % (Math.PI * 2)
    result.set(it.id, { x: Math.cos(angle) * ringR, y: Math.sin(angle) * ringR })
  })

  return result
}

const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5))
