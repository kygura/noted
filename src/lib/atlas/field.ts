import { contours as d3contours } from 'd3-contour'
import type { AtlasNode, FieldGrid, Vec2 } from './types'

export interface FieldOptions {
  /** World units per grid cell. Smaller = smoother but heavier. */
  cellSize?: number
  /** Gaussian sigma (world units) for each note's density bump. */
  bandwidth?: number
  /** World padding added around the node bounding box. */
  padding?: number
  /** Cells whose total density is below this fraction of the peak are "sea"
   *  (territory = -1), so territories read as islands rather than tiling. */
  minDensityFraction?: number
  /** Hard cap on grid dimensions for performance. */
  maxDim?: number
}

const EMPTY: FieldGrid = {
  cols: 0, rows: 0, cellSize: 1, origin: { x: 0, y: 0 },
  density: new Float64Array(0), territory: new Int32Array(0),
  regionIds: [], maxDensity: 0,
}

/**
 * Rasterise notes into a scalar field. Every region gets a Gaussian density
 * sum; the total drives relief, and the per-cell arg-max region drives the
 * territory map. One field, two readings — so borders and contours always agree.
 */
export function computeField(nodes: AtlasNode[], opts: FieldOptions = {}): FieldGrid {
  const finiteNodes = nodes.filter(n => Number.isFinite(n.pos.x) && Number.isFinite(n.pos.y))
  if (finiteNodes.length === 0) return { ...EMPTY }

  const bandwidth = opts.bandwidth ?? 42
  const padding = opts.padding ?? bandwidth * 1.5
  const minFrac = opts.minDensityFraction ?? 0.06
  const maxDim = opts.maxDim ?? 220

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of finiteNodes) {
    minX = Math.min(minX, n.pos.x); minY = Math.min(minY, n.pos.y)
    maxX = Math.max(maxX, n.pos.x); maxY = Math.max(maxY, n.pos.y)
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)

  let cellSize = opts.cellSize ?? Math.max(4, Math.min(spanX, spanY) / 60)
  let cols = Math.ceil(spanX / cellSize) + 1
  let rows = Math.ceil(spanY / cellSize) + 1
  if (cols > maxDim || rows > maxDim) {
    const factor = Math.max(cols / maxDim, rows / maxDim)
    cellSize *= factor
    cols = Math.ceil(spanX / cellSize) + 1
    rows = Math.ceil(spanY / cellSize) + 1
  }

  const origin: Vec2 = { x: minX, y: minY }

  // Region index table.
  const regionIds: (string | null)[] = []
  const regionIndex = new Map<string | null, number>()
  for (const n of finiteNodes) {
    if (!regionIndex.has(n.regionId)) {
      regionIndex.set(n.regionId, regionIds.length)
      regionIds.push(n.regionId)
    }
  }

  const cellCount = cols * rows
  const perRegion: Float64Array[] = regionIds.map(() => new Float64Array(cellCount))
  const density = new Float64Array(cellCount)

  const inv2s2 = 1 / (2 * bandwidth * bandwidth)
  const reach = Math.ceil((bandwidth * 3) / cellSize)

  for (const n of finiteNodes) {
    const ri = regionIndex.get(n.regionId)!
    const cx = (n.pos.x - origin.x) / cellSize
    const cy = (n.pos.y - origin.y) / cellSize
    const c0 = Math.max(0, Math.floor(cx) - reach)
    const c1 = Math.min(cols - 1, Math.ceil(cx) + reach)
    const r0 = Math.max(0, Math.floor(cy) - reach)
    const r1 = Math.min(rows - 1, Math.ceil(cy) + reach)
    const reg = perRegion[ri]
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const dx = (col - cx) * cellSize
        const dy = (row - cy) * cellSize
        const g = Math.exp(-(dx * dx + dy * dy) * inv2s2)
        const idx = row * cols + col
        reg[idx] += g
        density[idx] += g
      }
    }
  }

  let maxDensity = 0
  for (let i = 0; i < cellCount; i++) if (density[i] > maxDensity) maxDensity = density[i]

  const minDensity = maxDensity * minFrac
  const territory = new Int32Array(cellCount).fill(-1)
  for (let i = 0; i < cellCount; i++) {
    if (density[i] < minDensity) continue
    let best = -1
    let bestVal = 0
    for (let r = 0; r < perRegion.length; r++) {
      const v = perRegion[r][i]
      if (v > bestVal) { bestVal = v; best = r }
    }
    territory[i] = best
  }

  return { cols, rows, cellSize, origin, density, territory, regionIds, maxDensity }
}

function gridRingToWorld(ring: number[][], field: FieldGrid): Vec2[] {
  return ring.map(([gx, gy]) => ({
    x: field.origin.x + gx * field.cellSize,
    y: field.origin.y + gy * field.cellSize,
  }))
}

export interface ReliefBand {
  value: number
  rings: Vec2[][]
}

/** Iso-density contour lines of total density — the topographic relief. */
export function reliefContours(field: FieldGrid, bands = 5): ReliefBand[] {
  if (field.cols === 0 || field.maxDensity <= 0) return []
  const lo = field.maxDensity * 0.12
  const hi = field.maxDensity * 0.92
  const thresholds: number[] = []
  for (let k = 0; k < bands; k++) {
    thresholds.push(lo + ((hi - lo) * k) / Math.max(1, bands - 1))
  }
  const gen = d3contours().size([field.cols, field.rows]).thresholds(thresholds)
  const polys = gen(Array.from(field.density))
  return polys.map(mp => {
    const rings: Vec2[][] = []
    for (const polygon of mp.coordinates) {
      for (const ring of polygon) rings.push(gridRingToWorld(ring as number[][], field))
    }
    return { value: mp.value, rings }
  })
}

export interface TerritoryOutline {
  regionId: string | null
  rings: Vec2[][]
}

/** Smooth border polygons for each region, from the arg-max territory map. */
export function territoryOutlines(field: FieldGrid): TerritoryOutline[] {
  if (field.cols === 0) return []
  const out: TerritoryOutline[] = []
  const gen = d3contours().size([field.cols, field.rows]).thresholds([0.5])
  for (let ri = 0; ri < field.regionIds.length; ri++) {
    const indicator = new Array<number>(field.cols * field.rows)
    let any = false
    for (let i = 0; i < indicator.length; i++) {
      const on = field.territory[i] === ri
      indicator[i] = on ? 1 : 0
      if (on) any = true
    }
    if (!any) continue
    const polys = gen(indicator)
    const rings: Vec2[][] = []
    for (const mp of polys) {
      for (const polygon of mp.coordinates) {
        for (const ring of polygon) rings.push(gridRingToWorld(ring as number[][], field))
      }
    }
    out.push({ regionId: field.regionIds[ri], rings })
  }
  return out
}
