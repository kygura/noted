import type { Note } from '@/types'

const CARD_W = 240
const CARD_H = 170
const REGION_GAP = 120
const NOTE_GAP = 24

export interface Vec2 { x: number; y: number }

function seededRand(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s * 1664525 + 1013904223) | 0
    return ((s >>> 0) % 100000) / 100000
  }
}

function hashStr(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function project2D(embedding: number[], seed: number): Vec2 {
  const rand = seededRand(seed)
  const dim = embedding.length
  let x = 0, y = 0
  for (let i = 0; i < dim; i++) {
    x += embedding[i] * (rand() * 2 - 1)
    y += embedding[i] * (rand() * 2 - 1)
  }
  return { x, y }
}

export interface SeedResult {
  positions: Map<string, Vec2>
  regionBoxes: Map<string | null, { x: number; y: number; w: number; h: number }>
}

export function seedLayout(notes: Note[]): SeedResult {
  const positions = new Map<string, Vec2>()
  const byRegion = new Map<string | null, Note[]>()

  for (const n of notes) {
    const key = n.regionId ?? null
    if (!byRegion.has(key)) byRegion.set(key, [])
    byRegion.get(key)!.push(n)
  }

  const regionKeys = [...byRegion.keys()]
  const sortedKeys = regionKeys.sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return (byRegion.get(b)!.length - byRegion.get(a)!.length)
  })

  const regionBoxes = new Map<string | null, { x: number; y: number; w: number; h: number }>()
  const cols = Math.max(1, Math.ceil(Math.sqrt(sortedKeys.length)))

  sortedKeys.forEach((key, idx) => {
    const regionNotes = byRegion.get(key)!
    const seed = hashStr(key ?? '__unclustered__')

    const localPositions = computeRegionLocalPositions(regionNotes, seed)

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [, p] of localPositions) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + CARD_W)
      maxY = Math.max(maxY, p.y + CARD_H)
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = CARD_W; maxY = CARD_H }

    const regionW = maxX - minX
    const regionH = maxY - minY

    const col = idx % cols
    const row = Math.floor(idx / cols)
    const colWidth = 5 * CARD_W + REGION_GAP
    const rowHeight = 4 * CARD_H + REGION_GAP
    const originX = col * colWidth
    const originY = row * rowHeight

    for (const [id, p] of localPositions) {
      positions.set(id, { x: originX + (p.x - minX), y: originY + (p.y - minY) })
    }

    regionBoxes.set(key, {
      x: originX - 24,
      y: originY - 48,
      w: regionW + 48,
      h: regionH + 72,
    })
  })

  return { positions, regionBoxes }
}

function computeRegionLocalPositions(notes: Note[], seed: number): Map<string, Vec2> {
  const result = new Map<string, Vec2>()

  const withEmbedding = notes.filter(n => n.embedding && n.embedding.length > 0)
  const withoutEmbedding = notes.filter(n => !n.embedding || n.embedding.length === 0)

  if (withEmbedding.length === 0) {
    layoutGrid(notes, 0, 0).forEach((v, k) => result.set(k, v))
    return result
  }

  const projected: Array<{ id: string; p: Vec2 }> = withEmbedding.map(n => ({
    id: n.id,
    p: project2D(n.embedding!, seed),
  }))

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { p } of projected) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const targetW = Math.max(3, Math.ceil(Math.sqrt(notes.length))) * (CARD_W + NOTE_GAP)
  const targetH = Math.max(2, Math.ceil(notes.length / 3)) * (CARD_H + NOTE_GAP)

  const occupied: Array<{ x: number; y: number }> = []

  for (const { id, p } of projected) {
    let x = ((p.x - minX) / rangeX) * targetW
    let y = ((p.y - minY) / rangeY) * targetH
    ;({ x, y } = resolveOverlap(x, y, occupied))
    occupied.push({ x, y })
    result.set(id, { x, y })
  }

  const startY = Math.max(0, ...occupied.map(o => o.y + CARD_H + NOTE_GAP))
  layoutGrid(withoutEmbedding, 0, startY).forEach((v, k) => result.set(k, v))

  return result
}

function resolveOverlap(x: number, y: number, occupied: Array<{ x: number; y: number }>): Vec2 {
  const minDistX = CARD_W + NOTE_GAP
  const minDistY = CARD_H + NOTE_GAP
  let nx = x, ny = y
  let attempts = 0
  while (attempts < 50) {
    const collision = occupied.find(o => Math.abs(o.x - nx) < minDistX && Math.abs(o.y - ny) < minDistY)
    if (!collision) return { x: nx, y: ny }
    const dx = nx - collision.x
    const dy = ny - collision.y
    if (Math.abs(dx) >= Math.abs(dy)) nx = collision.x + (dx >= 0 ? minDistX : -minDistX)
    else ny = collision.y + (dy >= 0 ? minDistY : -minDistY)
    attempts++
  }
  return { x: nx, y: ny }
}

function layoutGrid(notes: Note[], startX: number, startY: number): Map<string, Vec2> {
  const out = new Map<string, Vec2>()
  const cols = Math.max(1, Math.ceil(Math.sqrt(notes.length)))
  notes.forEach((n, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    out.set(n.id, {
      x: startX + col * (CARD_W + NOTE_GAP),
      y: startY + row * (CARD_H + NOTE_GAP),
    })
  })
  return out
}

export function regionColor(regionId: string | null, isDark: boolean): { fill: string; stroke: string; label: string } {
  if (!regionId) {
    return {
      fill: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
      stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      label: isDark ? 'rgba(227,220,203,0.4)' : 'rgba(28,23,16,0.4)',
    }
  }
  const h = hashStr(regionId) % 360
  const sat = isDark ? 28 : 42
  const light = isDark ? 18 : 92
  const fillAlpha = isDark ? 0.35 : 0.55
  return {
    fill: `hsla(${h}, ${sat}%, ${light}%, ${fillAlpha})`,
    stroke: `hsla(${h}, ${sat}%, ${isDark ? 35 : 65}%, 0.4)`,
    label: `hsl(${h}, ${sat + 20}%, ${isDark ? 70 : 30}%)`,
  }
}

export { CARD_W, CARD_H }
