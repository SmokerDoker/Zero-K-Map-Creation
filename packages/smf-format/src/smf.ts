import { BinaryReader, BinaryWriter } from './binary-io'
import {
  ExtraHeaderType,
  MINIMAP_BYTE_SIZE,
  SMF_MAGIC,
  type SmfFeature,
  type SmfHeader,
  type SmfMap,
  type SmfTileFileRef
} from './types'

/** Simple deterministic checksum over the heightmap, good enough to detect accidental corruption. */
export function computeMapChecksum(heightMap: Uint16Array): number {
  let hash = 0x811c9dc5 // FNV-1a-ish seed
  for (let i = 0; i < heightMap.length; i++) {
    hash ^= heightMap[i]
    hash = Math.imul(hash, 0x01000193)
  }
  return hash | 0
}

export function encodeSmf(map: SmfMap): Uint8Array {
  const w = new BinaryWriter()
  const h = map.header

  w.fixedString(SMF_MAGIC, 16)
  w.int32(h.version)
  w.int32(h.mapId)
  w.int32(h.mapWidth)
  w.int32(h.mapHeight)
  w.int32(h.squareSize)
  w.int32(h.texelsPerSquare)
  w.int32(h.tileSize)
  w.float32(h.minHeight)
  w.float32(h.maxHeight)

  const heightmapPtrPos = w.offset
  w.int32(0)
  const typeMapPtrPos = w.offset
  w.int32(0)
  const tilesPtrPos = w.offset
  w.int32(0)
  const minimapPtrPos = w.offset
  w.int32(0)
  const metalmapPtrPos = w.offset
  w.int32(0)
  const featurePtrPos = w.offset
  w.int32(0)

  const hasVegetation = map.vegetationMap !== undefined
  w.int32(hasVegetation ? 1 : 0)

  let vegetationPtrPos = -1
  if (hasVegetation) {
    w.int32(12) // ExtraHeader.size: 8 base bytes + 4-byte pointer
    w.int32(ExtraHeaderType.Vegetation)
    vegetationPtrPos = w.offset
    w.int32(0)
  }

  const heightmapPtr = w.offset
  w.uint16Array(map.heightMap)

  const typeMapPtr = w.offset
  w.bytes(map.typeMap)

  const tilesPtr = w.offset
  w.int32(map.tileFiles.length)
  w.int32(map.tileFiles.reduce((sum, f) => sum + f.numTiles, 0))
  for (const file of map.tileFiles) {
    w.int32(file.numTiles)
    w.cString(file.fileName)
  }
  w.int32Array(map.tileIndices)

  const minimapPtr = w.offset
  w.bytes(map.minimap)

  const metalmapPtr = w.offset
  w.bytes(map.metalMap)

  const featurePtr = w.offset
  w.int32(map.featureTypes.length)
  w.int32(map.features.length)
  for (const name of map.featureTypes) w.cString(name)
  for (const feature of map.features) {
    w.int32(feature.typeIndex)
    w.float32(feature.x)
    w.float32(feature.y)
    w.float32(feature.z)
    w.float32(feature.rotation)
    w.float32(feature.relativeSize)
  }

  let vegetationPtr = 0
  if (hasVegetation) {
    vegetationPtr = w.offset
    w.bytes(map.vegetationMap as Uint8Array)
  }

  const out = w.toUint8Array()
  const patch = new DataView(out.buffer, out.byteOffset, out.byteLength)
  patch.setInt32(heightmapPtrPos, heightmapPtr, true)
  patch.setInt32(typeMapPtrPos, typeMapPtr, true)
  patch.setInt32(tilesPtrPos, tilesPtr, true)
  patch.setInt32(minimapPtrPos, minimapPtr, true)
  patch.setInt32(metalmapPtrPos, metalmapPtr, true)
  patch.setInt32(featurePtrPos, featurePtr, true)
  if (hasVegetation) patch.setInt32(vegetationPtrPos, vegetationPtr, true)

  return out
}

export function decodeSmf(data: Uint8Array): SmfMap {
  const r = new BinaryReader(data)

  const magic = r.fixedString(16)
  if (magic !== SMF_MAGIC) {
    throw new Error(`Ungültige SMF-Datei: falsche Magic-Signatur (${JSON.stringify(magic)})`)
  }

  const header: SmfHeader = {
    version: r.int32(),
    mapId: r.int32(),
    mapWidth: r.int32(),
    mapHeight: r.int32(),
    squareSize: r.int32(),
    texelsPerSquare: r.int32(),
    tileSize: r.int32(),
    minHeight: r.float32(),
    maxHeight: r.float32()
  }

  const heightmapPtr = r.int32()
  const typeMapPtr = r.int32()
  const tilesPtr = r.int32()
  const minimapPtr = r.int32()
  const metalmapPtr = r.int32()
  const featurePtr = r.int32()
  const numExtraHeaders = r.int32()

  let vegetationPtr: number | undefined
  for (let i = 0; i < numExtraHeaders; i++) {
    const size = r.int32()
    const type = r.int32()
    if (type === ExtraHeaderType.Vegetation) {
      vegetationPtr = r.int32()
      if (size > 12) r.seek(r.offset + (size - 12))
    } else {
      // Unknown/unsupported extra header type — skip its declared payload.
      r.seek(r.offset + (size - 8))
    }
  }

  r.seek(heightmapPtr)
  const heightMap = r.uint16Array((header.mapWidth + 1) * (header.mapHeight + 1))

  r.seek(typeMapPtr)
  const typeMap = r.uint8Array((header.mapWidth / 2) * (header.mapHeight / 2))

  r.seek(tilesPtr)
  const numTileFiles = r.int32()
  r.int32() // total tile count across all files — redundant with the per-file counts, not needed here
  const tileFiles: SmfTileFileRef[] = []
  for (let i = 0; i < numTileFiles; i++) {
    const numTiles = r.int32()
    const fileName = r.cString()
    tileFiles.push({ fileName, numTiles })
  }
  const tileIndexCount =
    ((header.mapWidth * header.texelsPerSquare) / header.tileSize) *
    ((header.mapHeight * header.texelsPerSquare) / header.tileSize)
  const tileIndices = r.int32Array(tileIndexCount)

  r.seek(minimapPtr)
  const minimap = r.uint8Array(MINIMAP_BYTE_SIZE)

  r.seek(metalmapPtr)
  const metalMap = r.uint8Array((header.mapWidth / 2) * (header.mapHeight / 2))

  r.seek(featurePtr)
  const numFeatureType = r.int32()
  const numFeatures = r.int32()
  const featureTypes: string[] = []
  for (let i = 0; i < numFeatureType; i++) featureTypes.push(r.cString())
  const features: SmfFeature[] = []
  for (let i = 0; i < numFeatures; i++) {
    features.push({
      typeIndex: r.int32(),
      x: r.float32(),
      y: r.float32(),
      z: r.float32(),
      rotation: r.float32(),
      relativeSize: r.float32()
    })
  }

  let vegetationMap: Uint8Array | undefined
  if (vegetationPtr !== undefined) {
    r.seek(vegetationPtr)
    vegetationMap = r.uint8Array((header.mapWidth / 4) * (header.mapHeight / 4))
  }

  return {
    header,
    heightMap,
    typeMap,
    tileFiles,
    tileIndices,
    minimap,
    metalMap,
    featureTypes,
    features,
    vegetationMap
  }
}
