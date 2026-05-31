import { describe, it, expect } from 'vitest'
import { projectEmbeddings, type Projectable } from '@/lib/atlas/project'

function variance(xs: number[]): number {
  const m = xs.reduce((s, a) => s + a, 0) / xs.length
  return xs.reduce((s, a) => s + (a - m) ** 2, 0) / xs.length
}

describe('projectEmbeddings', () => {
  it('returns an empty map for no items', () => {
    expect(projectEmbeddings([]).size).toBe(0)
  })

  it('is deterministic', () => {
    const items: Projectable[] = Array.from({ length: 11 }, (_, i) => ({
      id: 'n' + i,
      embedding: [i - 5, (i % 2 ? 0.3 : -0.3), 0.05 * i],
    }))
    const a = projectEmbeddings(items)
    const b = projectEmbeddings(items)
    for (const it of items) {
      expect(a.get(it.id)).toEqual(b.get(it.id))
    }
  })

  it('puts the axis of greatest embedding variance on the x axis (PC1)', () => {
    // Wide spread along dim 0, tiny spread along dim 1.
    const items: Projectable[] = Array.from({ length: 11 }, (_, i) => ({
      id: 'n' + i,
      embedding: [i - 5, i % 2 ? 0.3 : -0.3],
    }))
    const pos = projectEmbeddings(items)
    const xs = items.map(it => pos.get(it.id)!.x)
    const ys = items.map(it => pos.get(it.id)!.y)
    expect(variance(xs)).toBeGreaterThan(variance(ys))
  })

  it('preserves relative ordering along the dominant axis', () => {
    const items: Projectable[] = Array.from({ length: 6 }, (_, i) => ({
      id: 'n' + i,
      embedding: [i, 0],
    }))
    const pos = projectEmbeddings(items)
    const xs = items.map(it => pos.get(it.id)!.x)
    const sorted = [...xs].sort((a, b) => a - b)
    const reversed = [...xs].sort((a, b) => b - a)
    // Sign of PC1 is arbitrary, so accept either monotone direction.
    expect(xs).toSatisfy((arr: number[]) =>
      arr.every((v, i) => v === sorted[i]) || arr.every((v, i) => v === reversed[i]))
  })

  it('places items without embeddings deterministically', () => {
    const mixed: Projectable[] = [
      { id: 'a', embedding: [1, 2, 3] },
      { id: 'b', embedding: null },
      { id: 'c', embedding: null },
    ]
    const p1 = projectEmbeddings(mixed)
    const p2 = projectEmbeddings(mixed)
    expect(p1.has('b')).toBe(true)
    expect(p1.has('c')).toBe(true)
    expect(p1.get('b')).toEqual(p2.get('b'))
    expect(p1.get('b')).not.toEqual(p1.get('c'))
  })
})
