import { PNG } from 'pngjs'

/** A decoded external heightmap, normalized to 0..1 and resampled to the project's grid. */
export interface ImportedHeightmap {
  heights: Float32Array
  sourceWidth: number
  sourceHeight: number
  bitDepth: 8 | 16
  resampled: boolean
}

interface RawGrid {
  width: number
  height: number
  values: Float32Array // normalized 0..1
  bitDepth: 8 | 16
}

/** Decodes a PNG (8- or 16-bit, grayscale or color; the red channel is used). */
export function decodePngHeightmap(bytes: Uint8Array): RawGrid {
  const png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    skipRescale: true
  })
  const is16 = png.depth === 16
  const max = is16 ? 0xffff : 0xff
  const src = png.data as unknown as ArrayLike<number> // RGBA, Uint16Array for 16-bit sources
  const values = new Float32Array(png.width * png.height)
  for (let i = 0; i < values.length; i++) values[i] = src[i * 4] / max
  return { width: png.width, height: png.height, values, bitDepth: is16 ? 16 : 8 }
}

/**
 * Decodes headerless 16-bit little-endian RAW (.raw/.r16, as exported by World Machine, Gaea etc.).
 * RAW files carry no dimensions, so they must either match the expected grid exactly or be square.
 */
export function decodeRaw16Heightmap(
  bytes: Uint8Array,
  expectedWidth: number,
  expectedHeight: number
): RawGrid {
  if (bytes.byteLength % 2 !== 0) throw new Error('RAW heightmap has an odd byte length')
  const count = bytes.byteLength / 2
  let width: number
  let height: number
  if (count === expectedWidth * expectedHeight) {
    width = expectedWidth
    height = expectedHeight
  } else {
    const side = Math.round(Math.sqrt(count))
    if (side * side !== count) {
      throw new Error(
        `RAW heightmap size doesn't match ${expectedWidth}x${expectedHeight} and isn't square`
      )
    }
    width = side
    height = side
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const values = new Float32Array(count)
  for (let i = 0; i < count; i++) values[i] = view.getUint16(i * 2, true) / 0xffff
  return { width, height, values, bitDepth: 16 }
}

/** Bilinear resample of a normalized grid to a new resolution (corner-aligned, like Spring's
 * heightmaps where the outermost samples sit exactly on the map edges). */
export function resampleGrid(
  src: Float32Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Float32Array {
  if (srcWidth === dstWidth && srcHeight === dstHeight) return src.slice()
  const dst = new Float32Array(dstWidth * dstHeight)
  const sx = dstWidth > 1 ? (srcWidth - 1) / (dstWidth - 1) : 0
  const sy = dstHeight > 1 ? (srcHeight - 1) / (dstHeight - 1) : 0
  for (let y = 0; y < dstHeight; y++) {
    const fy = y * sy
    const y0 = Math.floor(fy)
    const y1 = Math.min(srcHeight - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < dstWidth; x++) {
      const fx = x * sx
      const x0 = Math.floor(fx)
      const x1 = Math.min(srcWidth - 1, x0 + 1)
      const tx = fx - x0
      const top = src[y0 * srcWidth + x0] * (1 - tx) + src[y0 * srcWidth + x1] * tx
      const bottom = src[y1 * srcWidth + x0] * (1 - tx) + src[y1 * srcWidth + x1] * tx
      dst[y * dstWidth + x] = top * (1 - ty) + bottom * ty
    }
  }
  return dst
}

export function importHeightmap(
  bytes: Uint8Array,
  fileName: string,
  targetWidth: number,
  targetHeight: number
): ImportedHeightmap {
  const lower = fileName.toLowerCase()
  const grid =
    lower.endsWith('.raw') || lower.endsWith('.r16')
      ? decodeRaw16Heightmap(bytes, targetWidth, targetHeight)
      : decodePngHeightmap(bytes)
  const resampled = grid.width !== targetWidth || grid.height !== targetHeight
  return {
    heights: resampleGrid(grid.values, grid.width, grid.height, targetWidth, targetHeight),
    sourceWidth: grid.width,
    sourceHeight: grid.height,
    bitDepth: grid.bitDepth,
    resampled
  }
}

/** Encodes normalized heights as a 16-bit grayscale PNG (the format mapconv/pymapconv expect). */
export function encodeHeightmapPng(heights: Float32Array, width: number, height: number): Uint8Array {
  const data = new Uint16Array(width * height)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(Math.max(0, Math.min(1, heights[i])) * 0xffff)
  }
  const options = { width, height, bitDepth: 16 as const, colorType: 0 as const, inputColorType: 0 as const, inputHasAlpha: false }
  const png = new PNG(options)
  png.data = data as unknown as Buffer
  return PNG.sync.write(png, options)
}
