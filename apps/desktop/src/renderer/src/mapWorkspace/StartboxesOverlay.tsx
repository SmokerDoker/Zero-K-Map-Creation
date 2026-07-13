import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import type { StartboxConfig } from '@zk-map/map-lua'
import { computeSceneScale, worldToScene } from './sceneCoords'

export interface StartboxHandleTarget {
  team: number
  kind: 'corner' | 'start'
  index: number
}

export interface StartboxesOverlayProps {
  config: StartboxConfig
  worldWidth: number
  worldHeight: number
  onHandleDown: (target: StartboxHandleTarget) => void
}

export const TEAM_COLORS = ['#4d7cff', '#ff5c5c']

// Startboxes are a flat, gameplay-abstract region (not terrain-conforming in Zero-K itself), so
// the whole box floats at a fixed height comfortably above any possible terrain — this keeps the
// outline and its corner handles visually coherent instead of zigzagging through hills.
const FLOAT_HEIGHT = 1.8

export function StartboxesOverlay({
  config,
  worldWidth,
  worldHeight,
  onHandleDown
}: StartboxesOverlayProps): JSX.Element {
  const scale = useMemo(() => computeSceneScale(worldWidth, worldHeight), [worldWidth, worldHeight])

  return (
    <group>
      {config.teams.map((team, ti) => {
        const color = TEAM_COLORS[ti % TEAM_COLORS.length]
        const box = team.boxes[0] ?? []
        const points: [number, number, number][] = box.map(([x, z]) => {
          const [sx, sz] = worldToScene(x, z, scale)
          return [sx, FLOAT_HEIGHT, sz]
        })
        const closedLoop = points.length > 0 ? [...points, points[0]] : []

        return (
          <group key={ti}>
            {closedLoop.length > 1 && <Line points={closedLoop} color={color} lineWidth={2} />}

            {box.map(([x, z], pi) => {
              const [sx, sz] = worldToScene(x, z, scale)
              return (
                <mesh
                  key={pi}
                  position={[sx, FLOAT_HEIGHT, sz]}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    onHandleDown({ team: ti, kind: 'corner', index: pi })
                  }}
                >
                  <sphereGeometry args={[0.16, 16, 16]} />
                  <meshStandardMaterial color={color} />
                </mesh>
              )
            })}

            {team.startpoints.map(([x, z], si) => {
              const [sx, sz] = worldToScene(x, z, scale)
              return (
                <mesh
                  key={si}
                  position={[sx, FLOAT_HEIGHT, sz]}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    onHandleDown({ team: ti, kind: 'start', index: si })
                  }}
                >
                  <sphereGeometry args={[0.22, 16, 16]} />
                  <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.6} />
                </mesh>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
