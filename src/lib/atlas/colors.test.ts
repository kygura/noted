import { describe, it, expect } from 'vitest'
import { regionHue, regionPalette } from '@/lib/atlas/colors'

describe('regionHue', () => {
  it('is deterministic for the same id', () => {
    expect(regionHue('abc')).toBe(regionHue('abc'))
  })

  it('returns a value in [0, 360)', () => {
    for (const id of ['a', 'region-1', 'xyz', 'long-region-id-123', '']) {
      const h = regionHue(id)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })

  it('spreads different ids across the wheel (not all identical)', () => {
    const hues = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map(regionHue))
    expect(hues.size).toBeGreaterThan(1)
  })
})

describe('regionPalette', () => {
  it('returns string channels for a null (unclustered) region', () => {
    const p = regionPalette(null, false)
    expect(typeof p.tint).toBe('string')
    expect(typeof p.border).toBe('string')
    expect(typeof p.label).toBe('string')
    expect(typeof p.mote).toBe('string')
  })

  it('differs between light and dark mode for the same id', () => {
    const light = regionPalette('topic', false)
    const dark = regionPalette('topic', true)
    expect(light.tint).not.toBe(dark.tint)
  })

  it('is deterministic for the same id and mode', () => {
    expect(regionPalette('topic', false)).toEqual(regionPalette('topic', false))
  })
})
