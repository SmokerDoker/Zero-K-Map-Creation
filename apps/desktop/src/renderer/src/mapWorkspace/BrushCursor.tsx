import { useMemo } from 'react'
import * as THREE from 'three'
import {
  computeSceneScale,
  gridRadiusToSceneRadius,
  heightToSceneY,
  sampleTerrainHeight,
  worldToScene
} from './sceneCoords'
import type { TerrainHit } from './MapScene3D'

export interface BrushCursorProps {
  hover: TerrainHit | null
  /** Brush radius in heightmap grid-cell units (same unit applyTerrainBrush expects). */
  radius: number
  heights: Float32Array
  heightmapWidth: number
  heightmapHeight: number
  worldWidth: number
  worldHeight: number
}

/** Ring outline showing exactly where and how large the terrain brush stamp will land, instead of
 * relying on the (invisible-in-3D) mouse cursor to judge position/radius. */
export function BrushCursor({
  hover,
  radius,
  heights,
  heightmapWidth,
  heightmapHeight,
  worldWidth,
  worldHeight
}: BrushCursorProps): JSX.Element | null {
  const scale = useMemo(() => computeSceneScale(worldWidth, worldHeight), [worldWidth, worldHeight])
  if (!hover) return null

  const [sx, sz] = worldToScene(hover.worldX, hover.worldZ, scale)
  const sy =
    heightToSceneY(sampleTerrainHeight(heights, heightmapWidth, heightmapHeight, hover.worldX, hover.worldZ)) +
    0.03
  const sceneRadius = gridRadiusToSceneRadius(radius, scale)
  const ringWidth = Math.max(0.015, sceneRadius * 0.08)

  return (
    <mesh position={[sx, sy, sz]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[Math.max(0.001, sceneRadius - ringWidth), sceneRadius, 48]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.85}
        side={THREE.DoubleSide}
        depthTest={false}
      />
    </mesh>
  )
}
