import type { RgbaImage } from '@zk-map/smf-format'

interface ColorStop {
  height: number // normalized 0..1
  color: [number, number, number]
}

// Simple elevation palette: low ground is sandy/dirt, mid is grass, high is rock, peaks are snow.
const COLOR_STOPS: ColorStop[] = [
  { height: 0, color: [138, 115, 85] },
  { height: 0.35, color: [92, 130, 66] },
  { height: 0.7, color: [120, 118, 112] },
  { height: 1, color: [235, 235, 240] }
]

function colorForHeight(v: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, v))
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i]
    const b = COLOR_STOPS[i + 1]
    if (clamped >= a.height && clamped <= b.height) {
      const t = (clamped - a.height) / (b.height - a.height || 1)
      return [
        a.color[0] + (b.color[0] - a.color[0]) * t,
        a.color[1] + (b.color[1] - a.color[1]) * t,
        a.color[2] + (b.color[2] - a.color[2]) * t
      ]
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1].color
}

/** Bilinearly samples the heightmap grid at fractional heightmap-space coordinates. */
function sampleHeight(heights: Float32Array, hmWidth: number, hmHeight: number, hx: number, hy: number): number {
  const cx = Math.max(0, Math.min(hmWidth - 1, hx))
  const cy = Math.max(0, Math.min(hmHeight - 1, hy))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(hmWidth - 1, x0 + 1)
  const y1 = Math.min(hmHeight - 1, y0 + 1)
  const tx = cx - x0
  const ty = cy - y0

  const h00 = heights[y0 * hmWidth + x0]
  const h10 = heights[y0 * hmWidth + x1]
  const h01 = heights[y1 * hmWidth + x0]
  const h11 = heights[y1 * hmWidth + x1]

  const top = h00 + (h10 - h00) * tx
  const bottom = h01 + (h11 - h01) * tx
  return top + (bottom - top) * ty
}

/**
 * Procedurally derives a diffuse ground texture from the heightmap (elevation-based color plus
 * simple slope shading). There is no texture-painting UI yet, so this is what "Compile" uses to
 * produce a real, visually reasonable default rather than a blank/placeholder ground texture.
 */
export function generateDiffuseTexture(
  heights: Float32Array,
  heightmapWidth: number,
  heightmapHeight: number,
  textureWidth: number,
  textureHeight: number
): RgbaImage {
  const data = new Uint8Array(textureWidth * textureHeight * 4)
  // heightmap has +1 samples per square edge; texture covers the squares themselves.
  const scaleX = (heightmapWidth - 1) / textureWidth
  const scaleY = (heightmapHeight - 1) / textureHeight
  const lightDir = normalize([0.4, 0.7, 0.6])
  const sampleStep = 1 // world-texel step used for the slope normal, in heightmap-space units

  for (let ty = 0; ty < textureHeight; ty++) {
    const hy = ty * scaleY
    for (let tx = 0; tx < textureWidth; tx++) {
      const hx = tx * scaleX
      const h = sampleHeight(heights, heightmapWidth, heightmapHeight, hx, hy)
      const hL = sampleHeight(heights, heightmapWidth, heightmapHeight, hx - sampleStep, hy)
      const hR = sampleHeight(heights, heightmapWidth, heightmapHeight, hx + sampleStep, hy)
      const hU = sampleHeight(heights, heightmapWidth, heightmapHeight, hx, hy - sampleStep)
      const hD = sampleHeight(heights, heightmapWidth, heightmapHeight, hx, hy + sampleStep)

      // Cheap normal estimate from central differences, scaled so gentle slopes stay near-flat.
      const nx = (hL - hR) * 4
      const nz = (hU - hD) * 4
      const normal = normalize([nx, 1, nz])
      const brightness = Math.max(0.55, Math.min(1.25, dot(normal, lightDir) + 0.35))

      const [r, g, b] = colorForHeight(h)
      const o = (ty * textureWidth + tx) * 4
      data[o] = Math.round(Math.max(0, Math.min(255, r * brightness)))
      data[o + 1] = Math.round(Math.max(0, Math.min(255, g * brightness)))
      data[o + 2] = Math.round(Math.max(0, Math.min(255, b * brightness)))
      data[o + 3] = 255
    }
  }

  return { width: textureWidth, height: textureHeight, data }
}

function normalize([x, y, z]: [number, number, number]): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Downsamples a diffuse texture to an exact target size via block averaging, for use as the SMF
 * minimap. Source dimensions must be an integer multiple of the target (true for every valid map
 * size here: texture width is always mapSquares*8, and mapSquares is always divisible by 128) —
 * repeated halving would not land exactly on the target for a source that isn't a power-of-two
 * multiple of it (e.g. a 6x6 map's 3072px texture: 3072 -> 1536 -> 768 overshoots 1024).
 */
export function downsampleTo(image: RgbaImage, targetWidth: number, targetHeight: number): RgbaImage {
  if (image.width % targetWidth !== 0 || image.height % targetHeight !== 0) {
    throw new Error(
      `Textur-Größe ${image.width}x${image.height} ist kein ganzzahliges Vielfaches des Ziels ${targetWidth}x${targetHeight}`
    )
  }
  const blockW = image.width / targetWidth
  const blockH = image.height / targetHeight
  const data = new Uint8Array(targetWidth * targetHeight * 4)

  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      let r = 0,
        g = 0,
        b = 0
      const count = blockW * blockH
      for (let by = 0; by < blockH; by++) {
        const sy = ty * blockH + by
        for (let bx = 0; bx < blockW; bx++) {
          const sx = tx * blockW + bx
          const o = (sy * image.width + sx) * 4
          r += image.data[o]
          g += image.data[o + 1]
          b += image.data[o + 2]
        }
      }
      const o = (ty * targetWidth + tx) * 4
      data[o] = Math.round(r / count)
      data[o + 1] = Math.round(g / count)
      data[o + 2] = Math.round(b / count)
      data[o + 3] = 255
    }
  }

  return { width: targetWidth, height: targetHeight, data }
}
