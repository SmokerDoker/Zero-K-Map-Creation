/**
 * Minimal DXT1 (BC1) block compressor/decompressor.
 *
 * Endpoints are chosen via a principal-axis ("PCA") fit: project the 16 pixels onto their
 * dominant color-variance axis and use the extreme two pixels as the two endpoints. A naive
 * per-channel min/max ("range fit") picks endpoints that don't actually occur in the block
 * whenever channels are anti-correlated (e.g. a red-to-green gradient), which produces a bogus
 * interpolation line and visibly wrong colors — PCA fit avoids that. Still not as high quality
 * as tools like NVDXT's "-quality_highest" mode; revisit if needed (see plan risk:
 * "DXT1-Kompressionsqualität").
 */

export interface RgbaImage {
  width: number
  height: number
  /** width*height*4 bytes, RGBA8888. */
  data: Uint8Array
}

function packRgb565(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3)
}

function unpackRgb565(value: number): [number, number, number] {
  const r5 = (value >> 11) & 0x1f
  const g6 = (value >> 5) & 0x3f
  const b5 = value & 0x1f
  return [(r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)]
}

/** Picks the two most extreme pixels along the block's dominant color axis as (c0, c1) endpoints. */
function pickEndpoints(block: Uint8Array): { c0: [number, number, number]; c1: [number, number, number] } {
  let meanR = 0,
    meanG = 0,
    meanB = 0
  for (let i = 0; i < 16; i++) {
    meanR += block[i * 4]
    meanG += block[i * 4 + 1]
    meanB += block[i * 4 + 2]
  }
  meanR /= 16
  meanG /= 16
  meanB /= 16

  let covRR = 0,
    covRG = 0,
    covRB = 0,
    covGG = 0,
    covGB = 0,
    covBB = 0
  for (let i = 0; i < 16; i++) {
    const dr = block[i * 4] - meanR
    const dg = block[i * 4 + 1] - meanG
    const db = block[i * 4 + 2] - meanB
    covRR += dr * dr
    covRG += dr * dg
    covRB += dr * db
    covGG += dg * dg
    covGB += dg * db
    covBB += db * db
  }

  // Power iteration to approximate the dominant eigenvector of the 3x3 covariance matrix.
  // Seeded with the matrix row of the largest-variance channel (one row is one application of
  // the matrix to a basis vector, i.e. already a first iteration step) rather than a fixed
  // (1,1,1): a magnitude-only seed like (1,1,1) can land exactly on a zero-eigenvalue direction
  // for anti-correlated channels (e.g. a red-up/green-down gradient) and collapse to zero.
  let ax: number, ay: number, az: number
  if (covRR >= covGG && covRR >= covBB) {
    ;[ax, ay, az] = [covRR, covRG, covRB]
  } else if (covGG >= covBB) {
    ;[ax, ay, az] = [covRG, covGG, covGB]
  } else {
    ;[ax, ay, az] = [covRB, covGB, covBB]
  }
  for (let iter = 0; iter < 4; iter++) {
    const nx = covRR * ax + covRG * ay + covRB * az
    const ny = covRG * ax + covGG * ay + covGB * az
    const nz = covRB * ax + covGB * ay + covBB * az
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    ax = nx / len
    ay = ny / len
    az = nz / len
  }

  let minProj = Infinity,
    maxProj = -Infinity,
    minIdx = 0,
    maxIdx = 0
  for (let i = 0; i < 16; i++) {
    const dr = block[i * 4] - meanR
    const dg = block[i * 4 + 1] - meanG
    const db = block[i * 4 + 2] - meanB
    const proj = dr * ax + dg * ay + db * az
    if (proj < minProj) {
      minProj = proj
      minIdx = i
    }
    if (proj > maxProj) {
      maxProj = proj
      maxIdx = i
    }
  }

  return {
    c0: [block[maxIdx * 4], block[maxIdx * 4 + 1], block[maxIdx * 4 + 2]],
    c1: [block[minIdx * 4], block[minIdx * 4 + 1], block[minIdx * 4 + 2]]
  }
}

/** Compresses a single 4x4 RGBA block (64 bytes, row-major) into 8 bytes of DXT1 data. */
export function compressBlockDXT1(block: Uint8Array): Uint8Array {
  const { c0: c0rgb, c1: c1rgb } = pickEndpoints(block)
  let c0 = packRgb565(...c0rgb)
  let c1 = packRgb565(...c1rgb)

  // Force strict inequality so decoders use 4-color opaque mode, never the 3-color+alpha mode.
  if (c0 === c1) {
    if (c1 > 0) c1 -= 1
    else c0 += 1
  } else if (c0 < c1) {
    ;[c0, c1] = [c1, c0]
  }

  const [r0, g0, b0] = unpackRgb565(c0)
  const [r1, g1, b1] = unpackRgb565(c1)
  const palette: [number, number, number][] = [
    [r0, g0, b0],
    [r1, g1, b1],
    [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3],
    [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3]
  ]

  let indices = 0
  for (let i = 15; i >= 0; i--) {
    const r = block[i * 4]
    const g = block[i * 4 + 1]
    const b = block[i * 4 + 2]
    let best = 0
    let bestDist = Infinity
    for (let p = 0; p < 4; p++) {
      const [pr, pg, pb] = palette[p]
      const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
      if (dist < bestDist) {
        bestDist = dist
        best = p
      }
    }
    indices = (indices << 2) | best
  }

  const out = new Uint8Array(8)
  const view = new DataView(out.buffer)
  view.setUint16(0, c0, true)
  view.setUint16(2, c1, true)
  view.setUint32(4, indices >>> 0, true)
  return out
}

/** Decompresses 8 bytes of DXT1 block data into a 4x4 RGBA block (64 bytes, row-major, alpha always 255). */
export function decompressBlockDXT1(block: Uint8Array): Uint8Array {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
  const c0 = view.getUint16(0, true)
  const c1 = view.getUint16(2, true)
  const indices = view.getUint32(4, true)

  const [r0, g0, b0] = unpackRgb565(c0)
  const [r1, g1, b1] = unpackRgb565(c1)

  const palette: [number, number, number][] =
    c0 > c1
      ? [
          [r0, g0, b0],
          [r1, g1, b1],
          [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3],
          [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3]
        ]
      : [
          [r0, g0, b0],
          [r1, g1, b1],
          [(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2],
          [0, 0, 0]
        ]

  const out = new Uint8Array(64)
  for (let i = 0; i < 16; i++) {
    const code = (indices >>> (i * 2)) & 0b11
    const [r, g, b] = palette[code]
    out[i * 4] = Math.round(r)
    out[i * 4 + 1] = Math.round(g)
    out[i * 4 + 2] = Math.round(b)
    out[i * 4 + 3] = code === 3 && c0 <= c1 ? 0 : 255
  }
  return out
}

function extractBlock(image: RgbaImage, blockX: number, blockY: number): Uint8Array {
  const out = new Uint8Array(64)
  for (let y = 0; y < 4; y++) {
    const srcY = Math.min(blockY * 4 + y, image.height - 1)
    for (let x = 0; x < 4; x++) {
      const srcX = Math.min(blockX * 4 + x, image.width - 1)
      const srcOffset = (srcY * image.width + srcX) * 4
      const dstOffset = (y * 4 + x) * 4
      out[dstOffset] = image.data[srcOffset]
      out[dstOffset + 1] = image.data[srcOffset + 1]
      out[dstOffset + 2] = image.data[srcOffset + 2]
      out[dstOffset + 3] = image.data[srcOffset + 3]
    }
  }
  return out
}

/** Compresses a full RGBA image (width/height must be multiples of 4) into a DXT1 byte blob. */
export function compressImageDXT1(image: RgbaImage): Uint8Array {
  const blocksX = image.width / 4
  const blocksY = image.height / 4
  const out = new Uint8Array(blocksX * blocksY * 8)
  let cursor = 0
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      out.set(compressBlockDXT1(extractBlock(image, bx, by)), cursor)
      cursor += 8
    }
  }
  return out
}

/** Decompresses a DXT1 byte blob (as produced by compressImageDXT1) back into an RGBA image. */
export function decompressImageDXT1(data: Uint8Array, width: number, height: number): RgbaImage {
  const blocksX = width / 4
  const blocksY = height / 4
  const out = new Uint8Array(width * height * 4)
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const blockOffset = (by * blocksX + bx) * 8
      const block = decompressBlockDXT1(data.subarray(blockOffset, blockOffset + 8))
      for (let y = 0; y < 4; y++) {
        const dstY = by * 4 + y
        for (let x = 0; x < 4; x++) {
          const dstX = bx * 4 + x
          const dstOffset = (dstY * width + dstX) * 4
          const srcOffset = (y * 4 + x) * 4
          out[dstOffset] = block[srcOffset]
          out[dstOffset + 1] = block[srcOffset + 1]
          out[dstOffset + 2] = block[srcOffset + 2]
          out[dstOffset + 3] = block[srcOffset + 3]
        }
      }
    }
  }
  return { width, height, data: out }
}

/** Box-filter downsample to half resolution (each output texel = average of a 2x2 input block). */
export function downsampleHalf(image: RgbaImage): RgbaImage {
  const width = image.width / 2
  const height = image.height / 2
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4
      for (let c = 0; c < 4; c++) {
        const s00 = image.data[((y * 2) * image.width + x * 2) * 4 + c]
        const s10 = image.data[((y * 2) * image.width + x * 2 + 1) * 4 + c]
        const s01 = image.data[((y * 2 + 1) * image.width + x * 2) * 4 + c]
        const s11 = image.data[((y * 2 + 1) * image.width + x * 2 + 1) * 4 + c]
        data[dst + c] = Math.round((s00 + s10 + s01 + s11) / 4)
      }
    }
  }
  return { width, height, data }
}

/**
 * Compresses `image` plus `numLevels - 1` box-filtered mip levels into one concatenated DXT1 blob,
 * matching the SMF/SMT convention of embedding a full mip chain per tile/minimap.
 */
export function compressMipChainDXT1(image: RgbaImage, numLevels: number): Uint8Array {
  const parts: Uint8Array[] = []
  let current = image
  for (let level = 0; level < numLevels; level++) {
    parts.push(compressImageDXT1(current))
    if (level < numLevels - 1) current = downsampleHalf(current)
  }
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.byteLength
  }
  return out
}

/** Decompresses only the base (level 0) image out of a compressed mip chain blob. */
export function decompressMipChainBaseDXT1(
  data: Uint8Array,
  baseWidth: number,
  baseHeight: number
): RgbaImage {
  const baseByteSize = (baseWidth * baseHeight) / 2
  return decompressImageDXT1(data.subarray(0, baseByteSize), baseWidth, baseHeight)
}
