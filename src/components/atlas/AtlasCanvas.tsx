import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { quadtree, type Quadtree } from 'd3-quadtree'
import { driftOffset } from '@/lib/atlas/simulate'
import { regionPalette } from '@/lib/atlas/colors'
import type { Vec2 } from '@/lib/atlas/types'
import type { ReliefBand, TerritoryOutline } from '@/lib/atlas/field'
import type { EdgeType } from '@/types'

export interface AtlasNodeView {
  id: string
  pos: Vec2
  regionId: string | null
  title: string
}

export interface RegionLabelView {
  regionId: string | null
  name: string
  pos: Vec2
}

export interface FocusEdgeView {
  to: Vec2
  type: EdgeType
}

export interface AtlasCanvasHandle {
  /** Ease the camera to centre a world point, optionally at a target zoom. */
  focusOn: (p: Vec2, zoom?: number) => void
  /** Frame all content. */
  fit: () => void
}

interface AtlasCanvasProps {
  nodes: AtlasNodeView[]
  territories: TerritoryOutline[]
  relief: ReliefBand[]
  labels: RegionLabelView[]
  dark: boolean
  focusId: string | null
  hoverId: string | null
  focusEdges: FocusEdgeView[]
  scores: Map<string, number> | null
  reduceMotion: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
  onOpen: (id: string) => void
  onBackground: () => void
  onContextMenu: (clientX: number, clientY: number, id: string | null) => void
}

interface Camera { x: number; y: number; k: number }

const TITLE_ZOOM = 1.15
const MIN_K = 0.05
const MAX_K = 6
const HIT_RADIUS_PX = 18

const EDGE_COLORS: Record<EdgeType, { light: string; dark: string }> = {
  supports: { light: '#3d7a4e', dark: '#5b9a6d' },
  contradicts: { light: '#b8473a', dark: '#c45c4a' },
  elaborates: { light: '#4a6fa5', dark: '#6b8ec4' },
  references: { light: '#7b5ea7', dark: '#9a7bc4' },
  'relates-to': { light: '#7a7265', dark: '#8a8274' },
}

export const AtlasCanvas = forwardRef<AtlasCanvasHandle, AtlasCanvasProps>(function AtlasCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1 })
  const camTargetRef = useRef<Camera | null>(null)
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 })
  const treeRef = useRef<Quadtree<AtlasNodeView> | null>(null)
  const dirtyRef = useRef(true)
  const initializedRef = useRef(false)

  const dragRef = useRef<{ x: number; y: number; moved: boolean; panning: boolean } | null>(null)

  // ── camera math (CSS-pixel space) ───────────────────────────────
  const worldToScreen = (p: Vec2): Vec2 => {
    const { w, h } = sizeRef.current
    const c = camRef.current
    return { x: (p.x - c.x) * c.k + w / 2, y: (p.y - c.y) * c.k + h / 2 }
  }
  const screenToWorld = (sx: number, sy: number): Vec2 => {
    const { w, h } = sizeRef.current
    const c = camRef.current
    return { x: (sx - w / 2) / c.k + c.x, y: (sy - h / 2) / c.k + c.y }
  }

  const fit = () => {
    const ns = propsRef.current.nodes
    const { w, h } = sizeRef.current
    if (ns.length === 0) { camRef.current = { x: 0, y: 0, k: 1 }; dirtyRef.current = true; return }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of ns) {
      minX = Math.min(minX, n.pos.x); minY = Math.min(minY, n.pos.y)
      maxX = Math.max(maxX, n.pos.x); maxY = Math.max(maxY, n.pos.y)
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY)
    const pad = 1.3
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(w / (spanX * pad), h / (spanY * pad))))
    camRef.current = { x: cx, y: cy, k }
    camTargetRef.current = null
    dirtyRef.current = true
  }

  useImperativeHandle(ref, () => ({
    focusOn: (p: Vec2, zoom?: number) => {
      const c = camRef.current
      camTargetRef.current = { x: p.x, y: p.y, k: zoom ?? Math.max(c.k, 1.4) }
    },
    fit,
  }))

  // ── sizing ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement!
    const ro = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      sizeRef.current = { w: rect.width, h: rect.height, dpr }
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
      if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas')
      offscreenRef.current.width = canvas.width
      offscreenRef.current.height = canvas.height
      dirtyRef.current = true
      if (!initializedRef.current && propsRef.current.nodes.length > 0) {
        initializedRef.current = true
        fit()
      }
    })
    ro.observe(parent)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── rebuild spatial index + mark dirty when geometry changes ─────
  useEffect(() => {
    treeRef.current = quadtree<AtlasNodeView>()
      .x(d => d.pos.x).y(d => d.pos.y)
      .addAll(props.nodes)
    dirtyRef.current = true
    if (!initializedRef.current && props.nodes.length > 0 && sizeRef.current.w > 1) {
      initializedRef.current = true
      fit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.nodes, props.territories, props.relief, props.dark, props.scores])

  // ── render loop ─────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    const render = (t: number) => {
      raf = requestAnimationFrame(render)
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const p = propsRef.current
      const { w, h, dpr } = sizeRef.current

      // ease camera toward target
      const target = camTargetRef.current
      if (target) {
        const c = camRef.current
        const nx = c.x + (target.x - c.x) * 0.12
        const ny = c.y + (target.y - c.y) * 0.12
        const nk = c.k + (target.k - c.k) * 0.12
        camRef.current = { x: nx, y: ny, k: nk }
        dirtyRef.current = true
        if (Math.hypot(target.x - nx, target.y - ny) < 0.5 && Math.abs(target.k - nk) < 0.005) {
          camRef.current = target
          camTargetRef.current = null
        }
      }

      // static geography → offscreen (only when dirty)
      if (dirtyRef.current && offscreenRef.current) {
        renderStatic(offscreenRef.current, p, sizeRef.current, camRef.current)
        dirtyRef.current = false
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (offscreenRef.current) {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(offscreenRef.current, 0, 0)
        ctx.restore()
      }

      drawDynamic(ctx, p, sizeRef.current, camRef.current, t, worldToScreen)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── interaction (native listeners reading propsRef) ─────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const pick = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect()
      const world = screenToWorld(clientX - rect.left, clientY - rect.top)
      const r = HIT_RADIUS_PX / camRef.current.k
      const found = treeRef.current?.find(world.x, world.y, r)
      return found?.id ?? null
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      const before = screenToWorld(sx, sy)
      const c = camRef.current
      const k = Math.min(MAX_K, Math.max(MIN_K, c.k * Math.exp(-e.deltaY * 0.0015)))
      camRef.current = { ...c, k }
      const after = screenToWorld(sx, sy)
      camRef.current = { x: c.x + (before.x - after.x), y: c.y + (before.y - after.y), k }
      camTargetRef.current = null
      dirtyRef.current = true
    }

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      dragRef.current = { x: e.clientX, y: e.clientY, moved: false, panning: false }
    }
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (d) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = d.panning = true
        if (d.panning) {
          const c = camRef.current
          camRef.current = { ...c, x: c.x - dx / c.k, y: c.y - dy / c.k }
          d.x = e.clientX; d.y = e.clientY
          camTargetRef.current = null
          dirtyRef.current = true
        }
        return
      }
      const id = pick(e.clientX, e.clientY)
      if (id !== propsRef.current.hoverId) propsRef.current.onHover(id)
      canvas.style.cursor = id ? 'pointer' : 'grab'
    }
    const onPointerUp = (e: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      if (d && !d.moved) {
        const id = pick(e.clientX, e.clientY)
        if (id) propsRef.current.onSelect(id)
        else propsRef.current.onBackground()
      }
    }
    const onDblClick = (e: MouseEvent) => {
      const id = pick(e.clientX, e.clientY)
      if (id) propsRef.current.onOpen(id)
    }
    const onCtx = (e: MouseEvent) => {
      e.preventDefault()
      const id = pick(e.clientX, e.clientY)
      propsRef.current.onContextMenu(e.clientX, e.clientY, id)
    }
    const onLeave = () => propsRef.current.onHover(null)

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('dblclick', onDblClick)
    canvas.addEventListener('contextmenu', onCtx)
    canvas.addEventListener('pointerleave', onLeave)
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('contextmenu', onCtx)
      canvas.removeEventListener('pointerleave', onLeave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} />
})

// ── drawing helpers ───────────────────────────────────────────────

function applyWorld(ctx: CanvasRenderingContext2D, size: { w: number; h: number; dpr: number }, cam: Camera) {
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  ctx.translate(size.w / 2, size.h / 2)
  ctx.scale(cam.k, cam.k)
  ctx.translate(-cam.x, -cam.y)
}

function tracePolyline(ctx: CanvasRenderingContext2D, ring: Vec2[]) {
  if (ring.length === 0) return
  ctx.moveTo(ring[0].x, ring[0].y)
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y)
  ctx.closePath()
}

function renderStatic(
  off: HTMLCanvasElement,
  p: AtlasCanvasProps,
  size: { w: number; h: number; dpr: number },
  cam: Camera,
) {
  const ctx = off.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, off.width, off.height)
  const queryActive = !!p.scores
  const dim = queryActive ? 0.45 : 1

  // territory tint fills
  applyWorld(ctx, size, cam)
  for (const terr of p.territories) {
    const pal = regionPalette(terr.regionId, p.dark)
    ctx.beginPath()
    for (const ring of terr.rings) tracePolyline(ctx, ring)
    ctx.fillStyle = pal.tint
    ctx.globalAlpha = dim
    ctx.fill('evenodd')
  }
  ctx.globalAlpha = 1

  // relief contours (topographic lines)
  const bandCount = Math.max(1, p.relief.length)
  p.relief.forEach((band, i) => {
    const heightT = i / bandCount
    ctx.beginPath()
    for (const ring of band.rings) tracePolyline(ctx, ring)
    ctx.strokeStyle = p.dark
      ? `rgba(227,220,203,${(0.08 + 0.12 * heightT) * dim})`
      : `rgba(107,95,77,${(0.26 + 0.26 * heightT) * dim})`
    ctx.lineWidth = 1 / cam.k
    ctx.lineJoin = 'round'
    ctx.stroke()
  })

  // territory borders
  for (const terr of p.territories) {
    const pal = regionPalette(terr.regionId, p.dark)
    ctx.beginPath()
    for (const ring of terr.rings) tracePolyline(ctx, ring)
    ctx.strokeStyle = pal.border
    ctx.globalAlpha = dim
    ctx.lineWidth = 1.4 / cam.k
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function drawDynamic(
  ctx: CanvasRenderingContext2D,
  p: AtlasCanvasProps,
  size: { w: number; h: number; dpr: number },
  cam: Camera,
  time: number,
  worldToScreen: (p: Vec2) => Vec2,
) {
  const showTitles = cam.k >= TITLE_ZOOM
  const queryActive = !!p.scores

  // focus edges (threads from the focused note to neighbours)
  if (p.focusId) {
    const focus = p.nodes.find(n => n.id === p.focusId)
    if (focus) {
      const fs = worldToScreen(focus.pos)
      for (const e of p.focusEdges) {
        const ts = worldToScreen(e.to)
        const col = EDGE_COLORS[e.type]
        ctx.strokeStyle = p.dark ? col.dark : col.light
        ctx.globalAlpha = 0.5
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.moveTo(fs.x, fs.y)
        ctx.lineTo(ts.x, ts.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
  }

  // region labels (italic serif, constant screen size)
  for (const label of p.labels) {
    const s = worldToScreen(label.pos)
    if (s.x < -40 || s.x > size.w + 40 || s.y < -40 || s.y > size.h + 40) continue
    const pal = regionPalette(label.regionId, p.dark)
    ctx.font = `italic 500 ${Math.round(15 + Math.min(7, cam.k * 2))}px 'Cormorant Garamond', Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = pal.label
    ctx.globalAlpha = queryActive ? 0.5 : 0.85
    ctx.fillText(label.name, s.x, s.y)
  }
  ctx.globalAlpha = 1

  // motes (notes) + optional titles
  for (const n of p.nodes) {
    let pos = n.pos
    if (!p.reduceMotion) {
      const d = driftOffset(n.id, time)
      pos = { x: pos.x + d.x, y: pos.y + d.y }
    }
    const s = worldToScreen(pos)
    if (s.x < -20 || s.x > size.w + 20 || s.y < -20 || s.y > size.h + 20) continue

    const isFocus = n.id === p.focusId
    const isHover = n.id === p.hoverId
    let alpha = 1
    let r = 3.1
    if (queryActive) {
      const score = p.scores!.get(n.id) ?? 0
      alpha = score < 0.15 ? 0.16 : score > 0.5 ? 1 : 0.3 + ((score - 0.15) / 0.35) * 0.7
      r = 2.6 + Math.max(0, score) * 3
    }
    if (isFocus) { r += 2.4; alpha = 1 }
    else if (isHover) { r += 1.4; alpha = Math.max(alpha, 0.9) }

    const pal = regionPalette(n.regionId, p.dark)

    if (isFocus || isHover) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2)
      ctx.fillStyle = pal.mote
      ctx.globalAlpha = alpha * 0.18
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2)
    ctx.fillStyle = pal.mote
    ctx.globalAlpha = alpha
    ctx.fill()
    if (isFocus) {
      ctx.lineWidth = 1.5
      ctx.strokeStyle = p.dark ? '#cfa23a' : '#8b6914'
      ctx.globalAlpha = 1
      ctx.stroke()
    }

    if ((showTitles || isHover || isFocus) && n.title) {
      ctx.globalAlpha = isFocus || isHover ? 1 : Math.min(0.85, alpha)
      ctx.font = `400 12px 'Newsreader', Georgia, serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = p.dark ? '#c9c0ad' : '#473d2f'
      const label = n.title.length > 32 ? n.title.slice(0, 31) + '…' : n.title
      ctx.fillText(label, s.x + r + 5, s.y)
    }
    ctx.globalAlpha = 1
  }
}
