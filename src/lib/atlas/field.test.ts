import { describe, it, expect } from 'vitest'
import { computeField, reliefContours, territoryOutlines } from '@/lib/atlas/field'
import type { AtlasNode } from '@/lib/atlas/types'

function node(id: string, regionId: string | null, x: number, y: number): AtlasNode {
  return { id, regionId, pos: { x, y } }
}

describe('computeField', () => {
  it('returns an empty grid for no nodes', () => {
    const f = computeField([])
    expect(f.cols).toBe(0)
    expect(f.rows).toBe(0)
    expect(f.density.length).toBe(0)
  })

  it('assigns cells near a cluster to that cluster\'s region (arg-max territory)', () => {
    const nodes = [
      node('a1', 'A', -100, 0), node('a2', 'A', -90, 10), node('a3', 'A', -110, -8),
      node('b1', 'B', 100, 0), node('b2', 'B', 90, -12), node('b3', 'B', 108, 9),
    ]
    const f = computeField(nodes, { cellSize: 10, bandwidth: 30 })
    const territoryAt = (x: number, y: number): string | null | undefined => {
      const col = Math.round((x - f.origin.x) / f.cellSize)
      const row = Math.round((y - f.origin.y) / f.cellSize)
      const t = f.territory[row * f.cols + col]
      return t < 0 ? undefined : f.regionIds[t]
    }
    expect(territoryAt(-100, 0)).toBe('A')
    expect(territoryAt(100, 0)).toBe('B')
  })

  it('peaks in density near a node', () => {
    const f = computeField([node('a', 'A', 0, 0)], { cellSize: 5, bandwidth: 20 })
    let mi = 0
    for (let i = 1; i < f.density.length; i++) if (f.density[i] > f.density[mi]) mi = i
    const col = mi % f.cols
    const row = Math.floor(mi / f.cols)
    const wx = f.origin.x + col * f.cellSize
    const wy = f.origin.y + row * f.cellSize
    expect(Math.hypot(wx, wy)).toBeLessThan(15)
  })

  it('ignores non-finite node coordinates', () => {
    const f = computeField([
      node('bad', 'A', Number.NaN, 0),
      node('good', 'B', 0, 0),
    ])

    expect(f.cols).toBeGreaterThan(0)
    expect(f.regionIds).toEqual(['B'])
  })
})

describe('territoryOutlines', () => {
  it('produces one outline group per present region, each with rings', () => {
    const nodes = [
      node('a1', 'A', -100, 0), node('a2', 'A', -90, 8),
      node('b1', 'B', 100, 0), node('b2', 'B', 92, -6),
    ]
    const f = computeField(nodes, { cellSize: 10, bandwidth: 30 })
    const outs = territoryOutlines(f)
    expect(outs.map(o => o.regionId).sort()).toEqual(['A', 'B'])
    for (const o of outs) {
      expect(o.rings.some(r => r.length >= 3)).toBe(true)
    }
  })
})

describe('reliefContours', () => {
  it('returns relief rings for a populated field', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => node('n' + i, 'A', i * 2 - 4, 0))
    const f = computeField(nodes, { cellSize: 5, bandwidth: 25 })
    const bands = reliefContours(f, 5)
    const totalRings = bands.reduce((s, b) => s + b.rings.length, 0)
    expect(totalRings).toBeGreaterThan(0)
  })
})
