/** Metadata stored in a map project's `project.json`. */
export interface MapProjectMetadata {
  /** Schema version of project.json itself, for future migrations. */
  schemaVersion: 1
  name: string
  author: string
  /** Map version string shown in Zero-K's map list, e.g. "1.0". */
  version: string
  description: string
  /**
   * Map size in Zero-K's usual "NxN" naming (e.g. 8 for an "8x8" map). One unit is
   * ZK_MAP_UNIT_SQUARES Spring map squares, so an "8x8" map is 512x512 squares.
   */
  size: {
    width: number
    height: number
  }
  createdAt: string
  updatedAt: string
}

/** A project as known to the app: metadata plus its location on disk. */
export interface MapProjectSummary extends MapProjectMetadata {
  /** Absolute path to the project's root folder (the `.zkmap` directory). */
  projectPath: string
}

/** One Zero-K "NxN" size unit equals this many Spring map squares (e.g. "8x8" = 512x512 squares). */
export const ZK_MAP_UNIT_SQUARES = 64

/** World-unit distance between adjacent heightmap vertices (fixed by the SMF format). */
export const ZK_SQUARE_SIZE_WORLD_UNITS = 8

/** Number of heightmap vertices along one axis for a given "NxN" size unit (squares + 1). */
export function heightmapResolution(sizeUnits: number): number {
  return sizeUnits * ZK_MAP_UNIT_SQUARES + 1
}

/** World-unit extent (the coordinate space startboxes/metal spots/features live in) for a given "NxN" size unit. */
export function mapWorldSize(sizeUnits: number): number {
  return sizeUnits * ZK_MAP_UNIT_SQUARES * ZK_SQUARE_SIZE_WORLD_UNITS
}

/** A project's editable terrain: a grid of normalized (0..1) elevation samples. */
export interface TerrainData {
  width: number
  height: number
  heights: Float32Array
}

/**
 * Cosmetic grouping for the feature palette (icon/color only). Unlike SMF/mapinfo fields, there
 * is no fixed, universally-valid set of feature *names* to offer here — real trees/rocks/geovents
 * come from FeatureDefs the map itself imports (typically via Springboard), which vary per map.
 * `typeName` is therefore always free text the mapper must match to their own imported assets.
 */
export type FeatureKind = 'tree' | 'rock' | 'geovent' | 'custom'

export interface MapFeatureInstance {
  id: string
  typeName: string
  kind: FeatureKind
  x: number
  z: number
  /** Radians. */
  rotation: number
  /** Reserved by the SMF format; keep near 1 unless the imported FeatureDef supports scaling. */
  scale: number
}

export interface FeatureLayout {
  features: MapFeatureInstance[]
}
