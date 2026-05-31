import {
  forceSimulation,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force'
import type { Vec2 } from './types'

export interface SettleInput {
  id: string
  pos: Vec2
}

export interface SettleOptions {
  /** Collision radius — minimum breathing room around each note. */
  radius?: number
  /** Number of simulation ticks. */
  iterations?: number
  /** Many-body charge (negative = repel). Defaults relative to radius. */
  charge?: number
}

interface SimNode extends SimulationNodeDatum {
  id: string
}

/** Deterministic PRNG so d3's collision jiggle doesn't randomise the layout. */
function seededRandomSource(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Relax a projected point cloud: scale it to a sensible world extent, then run
 * a deterministic d3-force pass that opens organic spacing and removes overlaps
 * while preserving the PCA structure. The same simulation, ticked slowly at
 * runtime, is what produces ambient drift — but drift itself is `driftOffset`,
 * a cheap pure function that never mutates the settled layout.
 */
export function settle(nodes: SettleInput[], opts: SettleOptions = {}): Map<string, Vec2> {
  const radius = opts.radius ?? 30
  const iterations = opts.iterations ?? 200
  const charge = opts.charge ?? -radius * 0.6

  const simNodes: SimNode[] = nodes.map(n => ({ id: n.id, x: n.pos.x, y: n.pos.y }))

  // Scale the (possibly tiny) projected cloud to a target extent so the
  // collision radius operates in the same units as the structure.
  let maxR = 0
  for (const n of simNodes) maxR = Math.max(maxR, Math.hypot(n.x ?? 0, n.y ?? 0))
  const target = radius * Math.sqrt(Math.max(1, simNodes.length)) * 1.3
  const scale = maxR > 1e-9 ? target / maxR : 1
  for (const n of simNodes) {
    n.x = (n.x ?? 0) * scale
    n.y = (n.y ?? 0) * scale
  }

  const sim = forceSimulation<SimNode>(simNodes)
    .randomSource(seededRandomSource(0x2545f491))
    .force('charge', forceManyBody<SimNode>().strength(charge))
    .force('collide', forceCollide<SimNode>(radius).strength(0.9).iterations(2))
    .force('x', forceX<SimNode>(0).strength(0.015))
    .force('y', forceY<SimNode>(0).strength(0.015))
    .stop()

  for (let i = 0; i < iterations; i++) sim.tick()

  const out = new Map<string, Vec2>()
  for (const n of simNodes) out.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })
  return out
}

function hashStr(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/**
 * Tiny, slow, seeded sinusoidal offset for ambient "breathing" motion. Bounded
 * by `amplitude`, so it never detaches a note from its territory. Pure — same
 * inputs always give the same offset.
 */
export function driftOffset(
  seed: string | number,
  timeMs: number,
  amplitude = 3,
  periodMs = 9000,
): Vec2 {
  const h = typeof seed === 'number' ? Math.abs(seed) : hashStr(seed)
  const phaseX = ((h % 1000) / 1000) * Math.PI * 2
  const phaseY = (((h >> 3) % 1000) / 1000) * Math.PI * 2
  const w = (2 * Math.PI) / periodMs
  return {
    x: Math.sin(timeMs * w + phaseX) * amplitude,
    y: Math.cos(timeMs * w * 0.8 + phaseY) * amplitude,
  }
}
