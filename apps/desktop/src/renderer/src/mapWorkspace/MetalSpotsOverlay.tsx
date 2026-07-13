import { useMemo } from 'react'
import type { MetalLayout } from '@zk-map/map-lua'
import { computeSceneScale, heightToSceneY, sampleTerrainHeight, worldToScene } from './sceneCoords'

export interface MetalSpotsOverlayProps {
  layout: MetalLayout
  heights: Float32Array
  heightmapWidth: number
  heightmapHeight: number
  worldWidth: number
  worldHeight: number
  selectedIndex: number | null
  onMarkerDown: (index: number) => void
}

const MARKER_HEIGHT_OFFSET = 0.15

export function MetalSpotsOverlay({
  layout,
  heights,
  heightmapWidth,
  heightmapHeight,
  worldWidth,
  worldHeight,
  selectedIndex,
  onMarkerDown
}: MetalSpotsOverlayProps): JSX.Element {
  const scale = useMemo(() => computeSceneScale(worldWidth, worldHeight), [worldWidth, worldHeight])

  return (
    <group>
      {layout.spots.map((spot, i) => {
        const [sx, sz] = worldToScene(spot.x, spot.z, scale)
        const sy = heightToSceneY(sampleTerrainHeight(heights, heightmapWidth, heightmapHeight, spot.x, spot.z)) + MARKER_HEIGHT_OFFSET
        const isSelected = i === selectedIndex
        return (
          <mesh
            key={i}
            position={[sx, sy, sz]}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.stopPropagation()
              onMarkerDown(i)
            }}
          >
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial
              color={isSelected ? '#ffd166' : '#f0b429'}
              emissive={isSelected ? '#7a4e00' : '#000000'}
            />
          </mesh>
        )
      })}
    </group>
  )
}
