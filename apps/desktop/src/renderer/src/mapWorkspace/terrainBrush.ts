export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten'

/** Applies one brush stamp centered at (centerX, centerY) in heightmap grid coordinates. Mutates
 * `heights` in place. Extracted unchanged from the old HeightmapCanvas so the math stays identical
 * regardless of whether the input comes from a 2D canvas or a 3D raycast hit. */
export function applyTerrainBrush(
  heights: Float32Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  strength: number,
  mode: BrushMode,
  flattenTarget: number
): void {
  const minX = Math.max(0, Math.floor(centerX - radius))
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius))
  const minY = Math.max(0, Math.floor(centerY - radius))
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dist = Math.hypot(x - centerX, y - centerY)
      if (dist > radius) continue
      const falloff = 1 - dist / radius // linear falloff, 1 at center to 0 at edge
      const index = y * width + x
      const current = heights[index]

      let next = current
      switch (mode) {
        case 'raise':
          next = current + strength * falloff
          break
        case 'lower':
          next = current - strength * falloff
          break
        case 'smooth': {
          const left = heights[index - 1] ?? current
          const right = heights[index + 1] ?? current
          const up = heights[index - width] ?? current
          const down = heights[index + width] ?? current
          const avg = (left + right + up + down) / 4
          next = current + (avg - current) * falloff * strength * 4
          break
        }
        case 'flatten':
          next = current + (flattenTarget - current) * falloff * strength * 4
          break
      }
      heights[index] = Math.max(0, Math.min(1, next))
    }
  }
}
