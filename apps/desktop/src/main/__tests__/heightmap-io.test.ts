import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { encodeHeightmapPng, importHeightmap, resampleGrid } from '../heightmap-io'

describe('heightmap import/export', () => {
  it('round-trips through a 16-bit PNG with 16-bit precision', () => {
    const w = 5
    const h = 3
    const heights = new Float32Array(w * h).map((_, i) => i / (w * h - 1))
    const png = encodeHeightmapPng(heights, w, h)
    const imported = importHeightmap(png, 'map.png', w, h)
    expect(imported.bitDepth).toBe(16)
    expect(imported.resampled).toBe(false)
    for (let i = 0; i < heights.length; i++) expect(imported.heights[i]).toBeCloseTo(heights[i], 4)
  })

  it('reads 8-bit color PNGs using the red channel', () => {
    const png = new PNG({ width: 2, height: 1 })
    png.data = Buffer.from([0, 9, 9, 255, 255, 9, 9, 255])
    const bytes = PNG.sync.write(png)
    const imported = importHeightmap(bytes, 'x.png', 2, 1)
    expect(imported.bitDepth).toBe(8)
    expect(Array.from(imported.heights)).toEqual([0, 1])
  })

  it('reads little-endian RAW16 and resamples it to the target grid', () => {
    const raw = new Uint8Array(2 * 2 * 2)
    const view = new DataView(raw.buffer)
    ;[0, 0xffff, 0, 0xffff].forEach((v, i) => view.setUint16(i * 2, v, true))
    const imported = importHeightmap(raw, 'terrain.r16', 3, 3)
    expect(imported.resampled).toBe(true)
    expect(imported.sourceWidth).toBe(2)
    expect(Array.from(imported.heights)).toEqual([0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1])
  })

  it('rejects RAW files that are neither the expected size nor square', () => {
    expect(() => importHeightmap(new Uint8Array(6), 'bad.raw', 4, 4)).toThrow()
  })

  it('resample keeps corners aligned', () => {
    const src = new Float32Array([0, 1, 2, 3])
    const out = resampleGrid(src, 2, 2, 5, 5)
    expect(out[0]).toBe(0)
    expect(out[4]).toBe(1)
    expect(out[20]).toBe(2)
    expect(out[24]).toBe(3)
  })
})
