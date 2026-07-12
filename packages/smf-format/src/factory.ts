import { MINIMAP_BYTE_SIZE, SMF_VERSION, SQUARE_SIZE, TEXELS_PER_SQUARE, TILE_SIZE } from './types'
import type { SmfMap } from './types'
import { computeMapChecksum } from './smf'

export interface BlankSmfOptions {
  /** Map size in squares, e.g. 8 for an 8x8 Zero-K map. Must be a multiple of 16 (so tile counts divide evenly). */
  mapWidth: number
  mapHeight: number
  minHeight?: number
  maxHeight?: number
  tileFileName: string
}

/**
 * Builds a flat, untextured SmfMap of the given size — useful as a starting point for a new
 * project and as fixture data for codec tests.
 */
export function createBlankSmf(options: BlankSmfOptions): SmfMap {
  const { mapWidth, mapHeight, tileFileName } = options
  if (mapWidth % 16 !== 0 || mapHeight % 16 !== 0) {
    throw new Error('mapWidth/mapHeight müssen Vielfache von 16 sein')
  }

  const heightMapLength = (mapWidth + 1) * (mapHeight + 1)
  const heightMap = new Uint16Array(heightMapLength).fill(0x8000) // flat mid-height plane

  const typeMap = new Uint8Array((mapWidth / 2) * (mapHeight / 2)) // all terrain type 0

  const tileIndexCount =
    ((mapWidth * TEXELS_PER_SQUARE) / TILE_SIZE) * ((mapHeight * TEXELS_PER_SQUARE) / TILE_SIZE)
  const tileIndices = new Int32Array(tileIndexCount) // all pointing at tile 0

  const minimap = new Uint8Array(MINIMAP_BYTE_SIZE)
  const metalMap = new Uint8Array((mapWidth / 2) * (mapHeight / 2))

  const map: SmfMap = {
    header: {
      version: SMF_VERSION,
      mapId: 0,
      mapWidth,
      mapHeight,
      squareSize: SQUARE_SIZE,
      texelsPerSquare: TEXELS_PER_SQUARE,
      tileSize: TILE_SIZE,
      minHeight: options.minHeight ?? -256,
      maxHeight: options.maxHeight ?? 512
    },
    heightMap,
    typeMap,
    tileFiles: [{ fileName: tileFileName, numTiles: 1 }],
    tileIndices,
    minimap,
    metalMap,
    featureTypes: [],
    features: []
  }

  map.header.mapId = computeMapChecksum(map.heightMap)
  return map
}
