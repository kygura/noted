export interface Vec2 {
  x: number
  y: number
}

/** A note positioned in atlas space, with its region membership. */
export interface AtlasNode {
  id: string
  regionId: string | null
  pos: Vec2
}

/**
 * A rasterised scalar field over atlas space. `density` is total note density
 * (drives relief contours); `territory[i]` indexes into `regionIds` and marks
 * which region "owns" that cell (arg-max of per-region density), or -1 for none.
 */
export interface FieldGrid {
  cols: number
  rows: number
  cellSize: number
  /** World coordinate of the grid's [0,0] corner. */
  origin: Vec2
  density: Float64Array
  territory: Int32Array
  regionIds: (string | null)[]
  /** Peak total density, for normalising relief thresholds. */
  maxDensity: number
}
