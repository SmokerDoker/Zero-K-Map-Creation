import { useMemo } from 'react'
import type { FeatureKind, FeatureLayout } from '@zk-map/shared-types'
import { computeSceneScale, heightToSceneY, sampleTerrainHeight, worldToScene } from './sceneCoords'

export interface FeaturesOverlayProps {
  layout: FeatureLayout
  heights: Float32Array
  heightmapWidth: number
  heightmapHeight: number
  worldWidth: number
  worldHeight: number
  selectedId: string | null
  onMarkerDown: (id: string) => void
}

export const KIND_COLORS: Record<FeatureKind, string> = {
  tree: '#5ea25e',
  rock: '#9aa3b0',
  geovent: '#e08a3c',
  custom: '#a56ee0'
}

const MARKER_HEIGHT_OFFSET = 0.2

function KindGeometry({ kind }: { kind: FeatureKind }): JSX.Element {
  switch (kind) {
    case 'tree':
      return <coneGeometry args={[0.16, 0.4, 8]} />
    case 'rock':
      return <dodecahedronGeometry args={[0.18]} />
    case 'geovent':
      return <octahedronGeometry args={[0.2]} />
    case 'custom':
      return <boxGeometry args={[0.28, 0.28, 0.28]} />
  }
}

export function FeaturesOverlay({
  layout,
  heights,
  heightmapWidth,
  heightmapHeight,
  worldWidth,
  worldHeight,
  selectedId,
  onMarkerDown
}: FeaturesOverlayProps): JSX.Element {
  const scale = useMemo(() => computeSceneScale(worldWidth, worldHeight), [worldWidth, worldHeight])

  return (
    <group>
      {layout.features.map((f) => {
        const [sx, sz] = worldToScene(f.x, f.z, scale)
        const sy =
          heightToSceneY(sampleTerrainHeight(heights, heightmapWidth, heightmapHeight, f.x, f.z)) +
          MARKER_HEIGHT_OFFSET * f.scale
        const isSelected = f.id === selectedId
        const missing = !f.typeName.trim()
        return (
          <mesh
            key={f.id}
            position={[sx, sy, sz]}
            rotation={[0, f.rotation, 0]}
            scale={f.scale}
            onPointerDown={(e) => {
              e.stopPropagation()
              onMarkerDown(f.id)
            }}
          >
            <KindGeometry kind={f.kind} />
            <meshStandardMaterial
              color={KIND_COLORS[f.kind]}
              emissive={isSelected ? '#333333' : '#000000'}
              transparent={missing}
              opacity={missing ? 0.55 : 1}
              wireframe={missing}
            />
          </mesh>
        )
      })}
    </group>
  )
}
