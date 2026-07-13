import {
  MINIMAP_SIZE_PX,
  SMF_VERSION,
  SQUARE_SIZE,
  TEXELS_PER_SQUARE,
  TILE_SIZE,
  computeMapChecksum,
  compressMipChainDXT1,
  encodeTileImage,
  type RgbaImage,
  type SmfFeature,
  type SmfMap,
  type SmtTileFile
} from '@zk-map/smf-format'
import type { FeatureLayout, MapProjectMetadata } from '@zk-map/shared-types'
import type { GameplaySettings } from '../mapconfig'
import { downsampleTo, generateDiffuseTexture } from './texture'

const MINIMAP_MIP_LEVELS = 9

export interface BuildSmfInput {
  project: MapProjectMetadata
  gameplay: GameplaySettings
  heights: Float32Array
  heightmapWidth: number
  heightmapHeight: number
  features: FeatureLayout
  tileFileName: string
}

export interface BuildSmfOutput {
  smf: SmfMap
  smt: SmtTileFile
  skippedFeatureCount: number
}

function sliceTile(image: RgbaImage, tileX: number, tileY: number): RgbaImage {
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4)
  for (let y = 0; y < TILE_SIZE; y++) {
    const srcY = tileY * TILE_SIZE + y
    const srcRowStart = (srcY * image.width + tileX * TILE_SIZE) * 4
    data.set(image.data.subarray(srcRowStart, srcRowStart + TILE_SIZE * 4), y * TILE_SIZE * 4)
  }
  return { width: TILE_SIZE, height: TILE_SIZE, data }
}

function hashBytes(data: Uint8Array): string {
  // FNV-1a — not cryptographic, just a fast dedup key; verified against a real byte-equality
  // check below before two tiles are treated as identical, so collisions can't cause corruption.
  let hash = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i]
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Slices the full diffuse texture into 32x32 tiles, de-duplicating identical ones (common on
 * smooth procedural terrain) before the relatively expensive DXT1 compression step. */
function buildTileset(diffuse: RgbaImage): { tiles: Uint8Array[]; tileIndices: Int32Array } {
  const tilesAcrossX = diffuse.width / TILE_SIZE
  const tilesAcrossY = diffuse.height / TILE_SIZE
  const tileIndices = new Int32Array(tilesAcrossX * tilesAcrossY)

  const byHash = new Map<string, number[]>() // hash -> candidate unique tile indices
  const uniqueSourceTiles: Uint8Array[] = []
  const compressedTiles: Uint8Array[] = []

  for (let ty = 0; ty < tilesAcrossY; ty++) {
    for (let tx = 0; tx < tilesAcrossX; tx++) {
      const tileImage = sliceTile(diffuse, tx, ty)
      const hash = hashBytes(tileImage.data)
      const candidates = byHash.get(hash)
      let uniqueIndex = -1
      if (candidates) {
        for (const candidate of candidates) {
          if (bytesEqual(uniqueSourceTiles[candidate], tileImage.data)) {
            uniqueIndex = candidate
            break
          }
        }
      }
      if (uniqueIndex === -1) {
        uniqueIndex = uniqueSourceTiles.length
        uniqueSourceTiles.push(tileImage.data)
        compressedTiles.push(encodeTileImage(tileImage))
        const list = byHash.get(hash)
        if (list) list.push(uniqueIndex)
        else byHash.set(hash, [uniqueIndex])
      }
      tileIndices[ty * tilesAcrossX + tx] = uniqueIndex
    }
  }

  return { tiles: compressedTiles, tileIndices }
}

/** Bilinearly-adjacent nearest-sample lookup of normalized height at a heightmap-space coordinate. */
function sampleHeightNearest(
  heights: Float32Array,
  hmWidth: number,
  hmHeight: number,
  hx: number,
  hy: number
): number {
  const x = Math.max(0, Math.min(hmWidth - 1, Math.round(hx)))
  const y = Math.max(0, Math.min(hmHeight - 1, Math.round(hy)))
  return heights[y * hmWidth + x]
}

export function buildSmf(input: BuildSmfInput): BuildSmfOutput {
  const { project, gameplay, heights, heightmapWidth, heightmapHeight } = input
  const mapWidth = (project.size.width * 64) | 0
  const mapHeight = (project.size.height * 64) | 0
  const textureWidth = mapWidth * TEXELS_PER_SQUARE
  const textureHeight = mapHeight * TEXELS_PER_SQUARE

  const diffuse = generateDiffuseTexture(heights, heightmapWidth, heightmapHeight, textureWidth, textureHeight)
  const { tiles, tileIndices } = buildTileset(diffuse)
  const smt: SmtTileFile = { version: 1, tileSize: TILE_SIZE, compressionType: 1, tiles }

  const minimapSource = downsampleTo(diffuse, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX)
  const minimap = compressMipChainDXT1(minimapSource, MINIMAP_MIP_LEVELS)

  const heightMapUint16 = new Uint16Array(heights.length)
  for (let i = 0; i < heights.length; i++) {
    heightMapUint16[i] = Math.round(Math.max(0, Math.min(1, heights[i])) * 0xffff)
  }

  const typeMap = new Uint8Array((mapWidth / 2) * (mapHeight / 2)) // no terrain-type painting yet
  const metalMap = new Uint8Array((mapWidth / 2) * (mapHeight / 2)) // Zero-K uses map_metal_layout.lua instead

  const featureTypes: string[] = []
  const featureTypeIndex = new Map<string, number>()
  const features: SmfFeature[] = []
  let skippedFeatureCount = 0

  for (const f of input.features.features) {
    const typeName = f.typeName.trim()
    if (!typeName) {
      skippedFeatureCount++
      continue
    }
    let typeIndex = featureTypeIndex.get(typeName)
    if (typeIndex === undefined) {
      typeIndex = featureTypes.length
      featureTypes.push(typeName)
      featureTypeIndex.set(typeName, typeIndex)
    }

    // World coordinates -> heightmap-grid-space: adjacent heightmap samples are SQUARE_SIZE apart.
    const hx = f.x / SQUARE_SIZE
    const hz = f.z / SQUARE_SIZE
    const normalizedHeight = sampleHeightNearest(heights, heightmapWidth, heightmapHeight, hx, hz)
    const worldY = gameplay.minHeight + normalizedHeight * (gameplay.maxHeight - gameplay.minHeight)

    features.push({
      typeIndex,
      x: f.x,
      y: worldY,
      z: f.z,
      rotation: f.rotation,
      relativeSize: f.scale
    })
  }

  const smf: SmfMap = {
    header: {
      version: SMF_VERSION,
      mapId: 0,
      mapWidth,
      mapHeight,
      squareSize: SQUARE_SIZE,
      texelsPerSquare: TEXELS_PER_SQUARE,
      tileSize: TILE_SIZE,
      minHeight: gameplay.minHeight,
      maxHeight: gameplay.maxHeight
    },
    heightMap: heightMapUint16,
    typeMap,
    tileFiles: [{ fileName: input.tileFileName, numTiles: tiles.length }],
    tileIndices,
    minimap,
    metalMap,
    featureTypes,
    features
  }
  smf.header.mapId = computeMapChecksum(smf.heightMap)

  return { smf, smt, skippedFeatureCount }
}
