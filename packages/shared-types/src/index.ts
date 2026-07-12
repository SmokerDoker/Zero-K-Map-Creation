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

/** Number of heightmap vertices along one axis for a given "NxN" size unit (squares + 1). */
export function heightmapResolution(sizeUnits: number): number {
  return sizeUnits * ZK_MAP_UNIT_SQUARES + 1
}

/** A project's editable terrain: a grid of normalized (0..1) elevation samples. */
export interface TerrainData {
  width: number
  height: number
  heights: Float32Array
}
