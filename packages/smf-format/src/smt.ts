import { BinaryReader, BinaryWriter } from './binary-io'
import { compressMipChainDXT1, decompressMipChainBaseDXT1, type RgbaImage } from './dxt1'
import { SMT_MAGIC, TILE_BYTE_SIZE, TILE_SIZE, type SmtTileFile } from './types'

const TILE_MIP_LEVELS = 4 // 32x32 base + 16x16 + 8x8 + 4x4, totaling TILE_BYTE_SIZE bytes

/** Compresses a 32x32 RGBA tile image (with mip chain) into the raw blob stored in an .smt file. */
export function encodeTileImage(image: RgbaImage): Uint8Array {
  if (image.width !== TILE_SIZE || image.height !== TILE_SIZE) {
    throw new Error(`Tile-Bilder müssen genau ${TILE_SIZE}x${TILE_SIZE} Pixel groß sein`)
  }
  const blob = compressMipChainDXT1(image, TILE_MIP_LEVELS)
  if (blob.byteLength !== TILE_BYTE_SIZE) {
    throw new Error(`Unerwartete Tile-Blob-Größe: ${blob.byteLength} (erwartet ${TILE_BYTE_SIZE})`)
  }
  return blob
}

/** Decompresses the base (32x32) level of a tile blob back into an RGBA image. */
export function decodeTileImage(tile: Uint8Array): RgbaImage {
  return decompressMipChainBaseDXT1(tile, TILE_SIZE, TILE_SIZE)
}

export function encodeSmt(tileFile: SmtTileFile): Uint8Array {
  const w = new BinaryWriter()
  w.fixedString(SMT_MAGIC, 16)
  w.int32(tileFile.version)
  w.int32(tileFile.tiles.length)
  w.int32(tileFile.tileSize)
  w.int32(tileFile.compressionType)
  for (const tile of tileFile.tiles) {
    if (tile.byteLength !== TILE_BYTE_SIZE) {
      throw new Error(`Tile-Blob muss genau ${TILE_BYTE_SIZE} Bytes groß sein, war ${tile.byteLength}`)
    }
    w.bytes(tile)
  }
  return w.toUint8Array()
}

export function decodeSmt(data: Uint8Array): SmtTileFile {
  const r = new BinaryReader(data)

  const magic = r.fixedString(16)
  if (magic !== SMT_MAGIC) {
    throw new Error(`Ungültige SMT-Datei: falsche Magic-Signatur (${JSON.stringify(magic)})`)
  }

  const version = r.int32()
  const numTiles = r.int32()
  const tileSize = r.int32()
  const compressionType = r.int32()

  const tiles: Uint8Array[] = []
  for (let i = 0; i < numTiles; i++) {
    tiles.push(r.uint8Array(TILE_BYTE_SIZE))
  }

  return { version, tileSize, compressionType, tiles }
}
