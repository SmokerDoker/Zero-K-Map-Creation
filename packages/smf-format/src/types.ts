/**
 * SMF/SMT binary format constants and structures, per the Spring engine map file spec
 * (mapfile.h, springrts Mapdev:SMF_format). All multi-byte fields are little-endian.
 */

export const SMF_MAGIC = 'spring map file'
export const SMT_MAGIC = 'spring tilefile'

export const SMF_VERSION = 1
export const SMT_VERSION = 1

export const SQUARE_SIZE = 8
export const TEXELS_PER_SQUARE = 8
export const TILE_SIZE = 32

export const COMPRESSION_DXT1 = 1

export const MINIMAP_SIZE_PX = 1024
export const MINIMAP_MIPMAPS = 9
/** Total byte size of a 1024x1024 DXT1 minimap including all 9 mip levels down to 4x4. */
export const MINIMAP_BYTE_SIZE = 699_048

/** Byte size of one 32x32 DXT1 tile including its 16x16/8x8/4x4 mip levels. */
export const TILE_BYTE_SIZE = 680

export enum ExtraHeaderType {
  None = 0,
  Vegetation = 1
}

export interface SmfHeader {
  version: number
  mapId: number
  /** Width in map squares. Must be divisible by 128. */
  mapWidth: number
  /** Height in map squares. Must be divisible by 128. */
  mapHeight: number
  squareSize: number
  texelsPerSquare: number
  tileSize: number
  minHeight: number
  maxHeight: number
}

export interface SmfTileFileRef {
  fileName: string
  numTiles: number
}

export interface SmfFeature {
  /** Index into `featureTypes`. */
  typeIndex: number
  x: number
  y: number
  z: number
  rotation: number
  /** Reserved by the format; keep at 1. */
  relativeSize: number
}

export interface SmfMap {
  header: SmfHeader
  /** (mapWidth+1) * (mapHeight+1) raw elevation samples, mapped linearly between minHeight (0) and maxHeight (0xffff). */
  heightMap: Uint16Array
  /** (mapWidth/2) * (mapHeight/2) terrain type indices. */
  typeMap: Uint8Array
  tileFiles: SmfTileFileRef[]
  /** (mapWidth/4) * (mapHeight/4) indices into the concatenated tile files. */
  tileIndices: Int32Array
  /** Raw 1024x1024 DXT1 minimap blob (with mipmaps), exactly MINIMAP_BYTE_SIZE bytes. */
  minimap: Uint8Array
  /** (mapWidth/2) * (mapHeight/2) metal density values. */
  metalMap: Uint8Array
  featureTypes: string[]
  features: SmfFeature[]
  /** Optional (mapWidth/4) * (mapHeight/4) ground vegetation map. */
  vegetationMap?: Uint8Array
}

export interface SmtTileFile {
  version: number
  tileSize: number
  compressionType: number
  /** Raw DXT1 tile blobs, each exactly TILE_BYTE_SIZE bytes (base + mip levels). */
  tiles: Uint8Array[]
}
