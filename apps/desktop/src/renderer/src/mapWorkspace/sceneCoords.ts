import { ZK_SQUARE_SIZE_WORLD_UNITS } from '@zk-map/shared-types'

/** The longer map axis is normalized to this many Three.js scene units; the shorter axis scales
 * proportionally, so non-square maps keep the correct visual aspect ratio. */
export const SCENE_SIZE = 12

/** Visual height exaggeration for the terrain mesh (purely cosmetic, matches the old TerrainPreview3D). */
export const HEIGHT_SCALE = 3

export interface SceneScale {
  sceneWidth: number
  sceneDepth: number
  worldWidth: number
  worldDepth: number
}

export function computeSceneScale(worldWidth: number, worldDepth: number): SceneScale {
  const factor = SCENE_SIZE / Math.max(worldWidth, worldDepth)
  return { sceneWidth: worldWidth * factor, sceneDepth: worldDepth * factor, worldWidth, worldDepth }
}

/** World (Spring) coordinates -> scene-local X/Z (the terrain plane is centered at the origin). */
export function worldToScene(worldX: number, worldZ: number, scale: SceneScale): [number, number] {
  const sx = (worldX / scale.worldWidth) * scale.sceneWidth - scale.sceneWidth / 2
  const sz = (worldZ / scale.worldDepth) * scale.sceneDepth - scale.sceneDepth / 2
  return [sx, sz]
}

/** Scene-local X/Z -> world (Spring) coordinates, clamped to the map bounds. */
export function sceneToWorld(sceneX: number, sceneZ: number, scale: SceneScale): [number, number] {
  const worldX = ((sceneX + scale.sceneWidth / 2) / scale.sceneWidth) * scale.worldWidth
  const worldZ = ((sceneZ + scale.sceneDepth / 2) / scale.sceneDepth) * scale.worldDepth
  return [
    Math.max(0, Math.min(scale.worldWidth, worldX)),
    Math.max(0, Math.min(scale.worldDepth, worldZ))
  ]
}

/** Normalized (0..1) elevation -> scene-local Y, matching the terrain mesh's own vertex displacement. */
export function heightToSceneY(normalized: number): number {
  return (normalized - 0.5) * HEIGHT_SCALE
}

/** Bilinearly samples the heightmap grid at a world-space (x, z) position. Mirrors the sampling
 * logic in apps/desktop/src/main/compile/texture.ts (kept separate: main-process code isn't
 * shared with the renderer bundle). */
export function sampleTerrainHeight(
  heights: Float32Array,
  heightmapWidth: number,
  heightmapHeight: number,
  worldX: number,
  worldZ: number
): number {
  const hx = Math.max(0, Math.min(heightmapWidth - 1, worldX / ZK_SQUARE_SIZE_WORLD_UNITS))
  const hz = Math.max(0, Math.min(heightmapHeight - 1, worldZ / ZK_SQUARE_SIZE_WORLD_UNITS))
  const x0 = Math.floor(hx)
  const z0 = Math.floor(hz)
  const x1 = Math.min(heightmapWidth - 1, x0 + 1)
  const z1 = Math.min(heightmapHeight - 1, z0 + 1)
  const tx = hx - x0
  const tz = hz - z0

  const h00 = heights[z0 * heightmapWidth + x0]
  const h10 = heights[z0 * heightmapWidth + x1]
  const h01 = heights[z1 * heightmapWidth + x0]
  const h11 = heights[z1 * heightmapWidth + x1]

  const top = h00 + (h10 - h00) * tx
  const bottom = h01 + (h11 - h01) * tx
  return top + (bottom - top) * tz
}

/** World-space (x, z) -> the nearest heightmap grid cell (for brush painting, which mutates by grid index). */
export function worldToGrid(worldX: number, worldZ: number): [number, number] {
  return [worldX / ZK_SQUARE_SIZE_WORLD_UNITS, worldZ / ZK_SQUARE_SIZE_WORLD_UNITS]
}

/** Converts a brush radius (in heightmap grid-cell units, as used by applyTerrainBrush) into a
 * scene-space radius, for drawing the brush cursor ring. */
export function gridRadiusToSceneRadius(gridRadius: number, scale: SceneScale): number {
  const worldRadius = gridRadius * ZK_SQUARE_SIZE_WORLD_UNITS
  return worldRadius * (scale.sceneWidth / scale.worldWidth)
}

export interface MeshDecimation {
  strideX: number
  strideY: number
  meshWidth: number
  meshHeight: number
}

/** Shared decimation math for any grid-based mesh built from the (potentially huge) full-res
 * heightmap — used by both the terrain mesh and the water mesh so they stay vertex-aligned. */
export function computeMeshDecimation(
  heightmapWidth: number,
  heightmapHeight: number,
  maxVertices: number
): MeshDecimation {
  const strideX = Math.max(1, Math.ceil((heightmapWidth - 1) / (maxVertices - 1)))
  const strideY = Math.max(1, Math.ceil((heightmapHeight - 1) / (maxVertices - 1)))
  const meshWidth = Math.floor((heightmapWidth - 1) / strideX) + 1
  const meshHeight = Math.floor((heightmapHeight - 1) / strideY) + 1
  return { strideX, strideY, meshWidth, meshHeight }
}

/**
 * Where world-height 0 falls on the map's own minHeight..maxHeight scale, as a normalized (0..1)
 * value usable with heightToSceneY() — or null if the map never dips below sea level at all.
 * Per the Spring engine wiki (Mapdev:mapinfo.lua / Mapdev:water): water always sits at world
 * elevation 0, terrain is placed above/below it purely via minHeight/maxHeight — there is no
 * separate configurable "water level" field.
 */
export function computeWaterLevelNormalized(minHeight: number, maxHeight: number): number | null {
  if (minHeight >= 0) return null
  const range = maxHeight - minHeight
  if (range <= 0) return null
  return Math.max(0, Math.min(1, (0 - minHeight) / range))
}
