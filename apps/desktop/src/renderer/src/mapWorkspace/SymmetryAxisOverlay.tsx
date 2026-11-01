import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { computeSceneScale, worldToScene } from './sceneCoords'
import { axisSegment, type SourceSide, type SymmetryMode } from './symmetry'

const AXIS_HEIGHT = 1.6

/** Draws the active symmetry axis as a dashed line floating above the terrain. */
export function SymmetryAxisOverlay({
  mode,
  side,
  worldWidth,
  worldHeight
}: {
  mode: SymmetryMode
  side: SourceSide
  worldWidth: number
  worldHeight: number
}): JSX.Element | null {
  const scale = useMemo(() => computeSceneScale(worldWidth, worldHeight), [worldWidth, worldHeight])
  const segment = axisSegment(mode, side, worldWidth, worldHeight)
  if (!segment) return null
  const points = segment.map(([x, z]) => {
    const [sx, sz] = worldToScene(x, z, scale)
    return [sx, AXIS_HEIGHT, sz] as [number, number, number]
  })
  return <Line points={points} color="#f6e05e" lineWidth={2} dashed dashSize={0.25} gapSize={0.15} />
}
