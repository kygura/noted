// Deterministic, parchment-tuned palette for atlas regions.
// Hues are spread by the golden angle so neighbouring regions stay distinct.

function hashStr(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

const GOLDEN_ANGLE = 137.508

/** Stable hue in [0, 360) for a region id. */
export function regionHue(regionId: string): number {
  return (hashStr(regionId) * GOLDEN_ANGLE) % 360
}

export interface RegionPalette {
  /** Soft fill wash for the territory. */
  tint: string
  /** Ink border stroke. */
  border: string
  /** Region label text colour. */
  label: string
  /** Note-dot ("settlement") colour. */
  mote: string
}

/** Palette for a region in the current theme. `null` = unclustered/neutral. */
export function regionPalette(regionId: string | null, isDark: boolean): RegionPalette {
  if (regionId === null) {
    return isDark
      ? {
          tint: 'rgba(227,220,203,0.03)',
          border: 'rgba(227,220,203,0.10)',
          label: 'rgba(227,220,203,0.45)',
          mote: 'rgba(227,220,203,0.55)',
        }
      : {
          tint: 'rgba(28,23,16,0.02)',
          border: 'rgba(28,23,16,0.10)',
          label: 'rgba(28,23,16,0.45)',
          mote: 'rgba(28,23,16,0.55)',
        }
  }
  const h = regionHue(regionId)
  const sat = isDark ? 26 : 40
  const tintL = isDark ? 16 : 90
  const tintA = isDark ? 0.32 : 0.5
  return {
    tint: `hsla(${h}, ${sat}%, ${tintL}%, ${tintA})`,
    border: `hsla(${h}, ${sat}%, ${isDark ? 42 : 55}%, 0.45)`,
    label: `hsl(${h}, ${sat + 18}%, ${isDark ? 72 : 32}%)`,
    mote: `hsl(${h}, ${sat + 10}%, ${isDark ? 64 : 38}%)`,
  }
}
