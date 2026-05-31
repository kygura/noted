import { describe, it, expect } from 'vitest'
import { settle, driftOffset, type SettleInput } from '@/lib/atlas/simulate'

function minPairwise(points: { x: number; y: number }[]): number {
  let min = Infinity
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y))
    }
  }
  return min
}

describe('settle', () => {
  it('returns a position for every node', () => {
    const out = settle([{ id: 'x', pos: { x: 1, y: 2 } }])
    expect(out.has('x')).toBe(true)
  })

  it('separates overlapping nodes beyond the collision radius', () => {
    const nodes: SettleInput[] = Array.from({ length: 8 }, (_, i) => ({
      id: 'n' + i,
      pos: { x: 0.01 * i, y: 0 },
    }))
    const out = settle(nodes, { radius: 20, iterations: 220 })
    const pts = nodes.map(n => out.get(n.id)!)
    expect(minPairwise(pts)).toBeGreaterThan(20)
  })

  it('is deterministic', () => {
    const nodes: SettleInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: 'n' + i,
      pos: { x: Math.cos(i), y: Math.sin(i) },
    }))
    const a = settle(nodes, { radius: 15 })
    const b = settle(nodes, { radius: 15 })
    for (const n of nodes) expect(a.get(n.id)).toEqual(b.get(n.id))
  })
})

describe('driftOffset', () => {
  it('stays within the given amplitude', () => {
    for (let t = 0; t < 6000; t += 113) {
      const d = driftOffset('seed', t, 4, 8000)
      expect(Math.abs(d.x)).toBeLessThanOrEqual(4 + 1e-9)
      expect(Math.abs(d.y)).toBeLessThanOrEqual(4 + 1e-9)
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(driftOffset('a', 1234)).toEqual(driftOffset('a', 1234))
  })

  it('differs across seeds at the same instant', () => {
    expect(driftOffset('a', 1234)).not.toEqual(driftOffset('b', 1234))
  })
})
