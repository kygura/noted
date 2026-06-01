import { describe, it, expect } from 'vitest'
import { chooseK, clusterEmbeddings, type ClusterItem } from '@/lib/atlas/cluster'

describe('chooseK', () => {
  it('is 0 for no notes', () => {
    expect(chooseK(0)).toBe(0)
  })

  it('collapses tiny sets into a single region', () => {
    expect(chooseK(1)).toBe(1)
    expect(chooseK(2)).toBe(1)
    expect(chooseK(3)).toBe(1)
  })

  it('never exceeds the unifying cap of 8, even for huge bases', () => {
    expect(chooseK(600)).toBe(8)
    expect(chooseK(5000)).toBe(8)
  })

  it('grows slowly and stays within [2, 8] for normal bases', () => {
    for (const n of [4, 20, 50, 120, 300]) {
      const k = chooseK(n)
      expect(k).toBeGreaterThanOrEqual(2)
      expect(k).toBeLessThanOrEqual(8)
      expect(k).toBeLessThanOrEqual(n)
    }
  })
})

describe('clusterEmbeddings', () => {
  it('returns nothing for no items', () => {
    expect(clusterEmbeddings([], 3)).toEqual([])
  })

  it('separates two well-separated blobs into the right groups', () => {
    // Group A hugs the x-axis, group B the y-axis: orthogonal under cosine.
    const items: ClusterItem[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: 'a' + i, embedding: [1, 0.05 * i, 0, 0] })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: 'b' + i, embedding: [0.05 * i, 1, 0, 0] })),
    ]
    const clusters = clusterEmbeddings(items, 2, { seed: 1 })
    expect(clusters.length).toBe(2)

    const withA0 = clusters.find(c => c.ids.includes('a0'))!
    expect(withA0.ids.sort()).toEqual(['a0', 'a1', 'a2', 'a3', 'a4'])
    const other = clusters.find(c => !c.ids.includes('a0'))!
    expect(other.ids.sort()).toEqual(['b0', 'b1', 'b2', 'b3', 'b4'])
  })

  it('is deterministic for a fixed seed', () => {
    const items: ClusterItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: 'n' + i,
      embedding: [Math.sin(i), Math.cos(i), (i % 3) - 1, 0.1 * i],
    }))
    const a = clusterEmbeddings(items, 4, { seed: 7 })
    const b = clusterEmbeddings(items, 4, { seed: 7 })
    expect(a).toEqual(b)
  })

  it('partitions every item exactly once with no empty clusters', () => {
    const items: ClusterItem[] = Array.from({ length: 23 }, (_, i) => ({
      id: 'n' + i,
      embedding: [Math.sin(i * 1.7), Math.cos(i * 0.9), (i % 5) - 2],
    }))
    const clusters = clusterEmbeddings(items, 5, { seed: 3 })
    const all = clusters.flatMap(c => c.ids).sort()
    expect(all).toEqual(items.map(i => i.id).sort())
    expect(clusters.every(c => c.ids.length > 0)).toBe(true)
  })

  it('never returns more clusters than items when k exceeds n', () => {
    const items: ClusterItem[] = [
      { id: 'x', embedding: [1, 0] },
      { id: 'y', embedding: [0, 1] },
      { id: 'z', embedding: [-1, 0] },
    ]
    const clusters = clusterEmbeddings(items, 8, { seed: 1 })
    expect(clusters.length).toBeLessThanOrEqual(3)
    expect(clusters.flatMap(c => c.ids).sort()).toEqual(['x', 'y', 'z'])
  })

  it('drops items with malformed embeddings rather than poisoning the run', () => {
    const items: ClusterItem[] = [
      { id: 'a', embedding: [1, 0, 0] },
      { id: 'bad', embedding: [Number.NaN, 1, 0] },
      { id: 'b', embedding: [0.9, 0.1, 0] },
    ]
    const clusters = clusterEmbeddings(items, 2, { seed: 1 })
    const all = clusters.flatMap(c => c.ids)
    expect(all).not.toContain('bad')
    expect(all.sort()).toEqual(['a', 'b'])
  })

  it('produces a unit-length centroid for each cluster', () => {
    const items: ClusterItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: 'n' + i,
      embedding: [Math.sin(i), Math.cos(i), 1],
    }))
    const clusters = clusterEmbeddings(items, 3, { seed: 2 })
    for (const c of clusters) {
      const norm = Math.sqrt(c.centroid.reduce((s, x) => s + x * x, 0))
      expect(norm).toBeCloseTo(1, 5)
    }
  })
})
