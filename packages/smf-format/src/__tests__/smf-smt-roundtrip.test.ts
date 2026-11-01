import { describe, expect, it } from 'vitest'
import { createBlankSmf } from '../factory'
import { decodeSmf, encodeSmf } from '../smf'
import { decodeSmt, encodeSmt, encodeTileImage, decodeTileImage } from '../smt'
import type { RgbaImage } from '../dxt1'
import type { SmfMap, SmtTileFile } from '../types'
import { TILE_BYTE_SIZE, MINIMAP_BYTE_SIZE } from '../types'

function checkerTile(a: [number, number, number], b: [number, number, number]): RgbaImage {
  const width = 32
  const height = 32
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = ((x >> 3) + (y >> 3)) % 2 === 0
      const [r, g, bl] = on ? a : b
      const o = (y * width + x) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = bl
      data[o + 3] = 255
    }
  }
  return { width, height, data }
}

describe('SMF codec', () => {
  it('round-trips a blank 8x8 map exactly (lossless sections)', () => {
    const original = createBlankSmf({ mapWidth: 128, mapHeight: 128, tileFileName: 'grass.smt' })
    const encoded = encodeSmf(original)
    const decoded = decodeSmf(encoded)

    expect(decoded.header).toEqual(original.header)
    expect(decoded.heightMap).toEqual(original.heightMap)
    expect(decoded.typeMap).toEqual(original.typeMap)
    expect(decoded.tileFiles).toEqual(original.tileFiles)
    expect(decoded.tileIndices).toEqual(original.tileIndices)
    expect(decoded.metalMap).toEqual(original.metalMap)
    expect(decoded.minimap).toEqual(original.minimap)
    expect(decoded.featureTypes).toEqual(original.featureTypes)
    expect(decoded.features).toEqual(original.features)
  })

  it('round-trips a realistic map with terrain variation, features and vegetation', () => {
    const base = createBlankSmf({ mapWidth: 128, mapHeight: 128, tileFileName: 'terrain0.smt' })

    // Simulate some sculpted terrain instead of a flat plane.
    const heightMap = base.heightMap.slice()
    for (let i = 0; i < heightMap.length; i++) {
      heightMap[i] = (i * 37) % 0xffff
    }

    const typeMap = base.typeMap.slice()
    typeMap.fill(3)

    const vegetationMap = new Uint8Array((base.header.mapWidth / 4) * (base.header.mapHeight / 4))
    vegetationMap.fill(1)

    const map: SmfMap = {
      ...base,
      heightMap,
      typeMap,
      tileFiles: [
        { fileName: 'terrain0.smt', numTiles: 2 },
        { fileName: 'terrain1.smt', numTiles: 3 }
      ],
      featureTypes: ['tree_01', 'rock_02', 'geovent'],
      features: [
        // Rotation/position use values exactly representable in float32 (the on-disk field type),
        // so the round trip can assert exact equality instead of tolerating precision drift.
        { typeIndex: 0, x: 64, y: 12, z: 64, rotation: 0, relativeSize: 1 },
        { typeIndex: 1, x: 200, y: 8, z: 300, rotation: 1.5, relativeSize: 1 },
        { typeIndex: 2, x: 500, y: 20, z: 500, rotation: 3.25, relativeSize: 1 }
      ],
      vegetationMap
    }

    const decoded = decodeSmf(encodeSmf(map))

    expect(decoded.header).toEqual(map.header)
    expect(decoded.heightMap).toEqual(map.heightMap)
    expect(decoded.typeMap).toEqual(map.typeMap)
    expect(decoded.tileFiles).toEqual(map.tileFiles)
    expect(decoded.featureTypes).toEqual(map.featureTypes)
    expect(decoded.features).toEqual(map.features)
    expect(decoded.vegetationMap).toEqual(map.vegetationMap)
  })

  it('rejects a buffer with the wrong magic', () => {
    const bogus = new Uint8Array(80)
    expect(() => decodeSmf(bogus)).toThrow(/magic/)
  })
})

describe('SMT codec', () => {
  it('round-trips a tile file containing compressed checkerboard tiles', () => {
    const tileA = encodeTileImage(checkerTile([200, 40, 40], [40, 40, 200]))
    const tileB = encodeTileImage(checkerTile([255, 255, 255], [0, 0, 0]))
    expect(tileA.byteLength).toBe(TILE_BYTE_SIZE)

    const tileFile: SmtTileFile = {
      version: 1,
      tileSize: 32,
      compressionType: 1,
      tiles: [tileA, tileB]
    }

    const decoded = decodeSmt(encodeSmt(tileFile))
    expect(decoded.version).toBe(1)
    expect(decoded.tileSize).toBe(32)
    expect(decoded.compressionType).toBe(1)
    expect(decoded.tiles).toHaveLength(2)
    expect(decoded.tiles[0]).toEqual(tileA)
    expect(decoded.tiles[1]).toEqual(tileB)

    // And the decompressed pixels should still resemble the original checkerboard colors.
    const image = decodeTileImage(decoded.tiles[0])
    expect(image.width).toBe(32)
    expect(image.height).toBe(32)
  })

  it('rejects a tile blob with the wrong byte size', () => {
    const tileFile: SmtTileFile = {
      version: 1,
      tileSize: 32,
      compressionType: 1,
      tiles: [new Uint8Array(10)]
    }
    expect(() => encodeSmt(tileFile)).toThrow(/680 bytes/)
  })
})

describe('constants sanity check', () => {
  it('MINIMAP_BYTE_SIZE matches the 1024x1024 DXT1 + 9 mip levels formula', () => {
    let expected = 0
    let size = 1024
    for (let i = 0; i < 9; i++) {
      expected += (size * size) / 2
      size /= 2
    }
    expect(expected).toBe(MINIMAP_BYTE_SIZE)
  })
})
