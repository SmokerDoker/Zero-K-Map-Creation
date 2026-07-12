import { describe, expect, it } from 'vitest'
import {
  compressBlockDXT1,
  compressImageDXT1,
  compressMipChainDXT1,
  decompressBlockDXT1,
  decompressImageDXT1,
  decompressMipChainBaseDXT1,
  downsampleHalf,
  type RgbaImage
} from '../dxt1'

function solidBlock(r: number, g: number, b: number): Uint8Array {
  const block = new Uint8Array(64)
  for (let i = 0; i < 16; i++) {
    block[i * 4] = r
    block[i * 4 + 1] = g
    block[i * 4 + 2] = b
    block[i * 4 + 3] = 255
  }
  return block
}

function maxChannelDiff(a: Uint8Array, b: Uint8Array): number {
  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]))
  return max
}

describe('DXT1 block codec', () => {
  it('reproduces a solid-color block exactly (within 565 quantization)', () => {
    const original = solidBlock(200, 100, 50)
    const compressed = compressBlockDXT1(original)
    expect(compressed.byteLength).toBe(8)
    const decoded = decompressBlockDXT1(compressed)
    // RGB565 quantizes 8-bit channels down to 5/6/5 bits, so allow the resulting rounding error.
    expect(maxChannelDiff(original, decoded)).toBeLessThanOrEqual(8)
  })

  it('keeps a gradient block reasonably close after compression', () => {
    const block = new Uint8Array(64)
    for (let i = 0; i < 16; i++) {
      block[i * 4] = i * 16
      block[i * 4 + 1] = 255 - i * 16
      block[i * 4 + 2] = 128
      block[i * 4 + 3] = 255
    }
    const decoded = decompressBlockDXT1(compressBlockDXT1(block))
    expect(maxChannelDiff(block, decoded)).toBeLessThan(40)
  })
})

describe('DXT1 image codec', () => {
  it('round-trips a full 32x32 checkerboard image', () => {
    const width = 32
    const height = 32
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const on = ((x >> 2) + (y >> 2)) % 2 === 0
        const o = (y * width + x) * 4
        data[o] = on ? 220 : 20
        data[o + 1] = on ? 220 : 20
        data[o + 2] = on ? 220 : 20
        data[o + 3] = 255
      }
    }
    const image: RgbaImage = { width, height, data }
    const compressed = compressImageDXT1(image)
    expect(compressed.byteLength).toBe((width / 4) * (height / 4) * 8)

    const decoded = decompressImageDXT1(compressed, width, height)
    expect(maxChannelDiff(image.data, decoded.data)).toBeLessThan(20)
  })
})

describe('mip chain helpers', () => {
  it('downsampleHalf averages 2x2 blocks', () => {
    const data = new Uint8Array([
      0, 0, 0, 255, 100, 0, 0, 255,
      0, 100, 0, 255, 0, 0, 100, 255
    ])
    const image: RgbaImage = { width: 2, height: 2, data }
    const half = downsampleHalf(image)
    expect(half.width).toBe(1)
    expect(half.height).toBe(1)
    expect(Array.from(half.data)).toEqual([25, 25, 25, 255])
  })

  it('compresses a full 32x32 mip chain into exactly 680 bytes (base+16x16+8x8+4x4)', () => {
    const width = 32
    const height = 32
    const data = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 128
      data[i * 4 + 1] = 64
      data[i * 4 + 2] = 200
      data[i * 4 + 3] = 255
    }
    const image: RgbaImage = { width, height, data }
    const blob = compressMipChainDXT1(image, 4)
    expect(blob.byteLength).toBe(680)

    const base = decompressMipChainBaseDXT1(blob, width, height)
    expect(maxChannelDiff(image.data, base.data)).toBeLessThanOrEqual(8)
  })
})
