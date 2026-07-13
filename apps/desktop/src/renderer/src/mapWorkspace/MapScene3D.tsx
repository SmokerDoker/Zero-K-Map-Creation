import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { computeSceneScale, heightToSceneY, sceneToWorld, SCENE_SIZE } from './sceneCoords'

/** Cap on the displayed mesh resolution per axis — full-res data can be in the hundreds, which is
 * fine for painting precision but too many vertices to rebuild smoothly every brush stroke. */
const MAX_PREVIEW_VERTICES = 129

export type CameraPreset = 'orbit' | 'topdown'

export interface TerrainHit {
  worldX: number
  worldZ: number
}

export interface MapScene3DProps {
  heightsRef: React.MutableRefObject<Float32Array>
  heightmapWidth: number
  heightmapHeight: number
  worldWidth: number
  worldHeight: number
  /** Bumped whenever the heightmap data changes, to trigger a mesh update. */
  version: number
  cameraPreset: CameraPreset
  onTerrainDown?: (hit: TerrainHit) => void
  onTerrainMove?: (hit: TerrainHit) => void
  onTerrainUp?: () => void
  children?: React.ReactNode
}

type TerrainMeshProps = Omit<MapScene3DProps, 'cameraPreset' | 'children'>

function TerrainMesh({
  heightsRef,
  heightmapWidth,
  heightmapHeight,
  worldWidth,
  worldHeight,
  version,
  onTerrainDown,
  onTerrainMove,
  onTerrainUp
}: TerrainMeshProps): JSX.Element {
  const scale = useMemo(() => computeSceneScale(worldWidth, worldHeight), [worldWidth, worldHeight])

  const strideX = Math.max(1, Math.ceil((heightmapWidth - 1) / (MAX_PREVIEW_VERTICES - 1)))
  const strideY = Math.max(1, Math.ceil((heightmapHeight - 1) / (MAX_PREVIEW_VERTICES - 1)))
  const meshWidth = Math.floor((heightmapWidth - 1) / strideX) + 1
  const meshHeight = Math.floor((heightmapHeight - 1) / strideY) + 1

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(scale.sceneWidth, scale.sceneDepth, meshWidth - 1, meshHeight - 1)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [scale.sceneWidth, scale.sceneDepth, meshWidth, meshHeight])

  useEffect(() => {
    const position = geometry.attributes.position as THREE.BufferAttribute
    const heights = heightsRef.current
    for (let y = 0; y < meshHeight; y++) {
      const srcY = Math.min(y * strideY, heightmapHeight - 1)
      for (let x = 0; x < meshWidth; x++) {
        const srcX = Math.min(x * strideX, heightmapWidth - 1)
        const h = heights[srcY * heightmapWidth + srcX] ?? 0.5
        position.setY(y * meshWidth + x, heightToSceneY(h))
      }
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
    // `version` is intentionally the trigger for re-running this effect on every brush stroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, meshWidth, meshHeight, strideX, strideY, heightmapWidth, heightmapHeight, version])

  function toHit(event: ThreeEvent<PointerEvent>): TerrainHit {
    const [worldX, worldZ] = sceneToWorld(event.point.x, event.point.z, scale)
    return { worldX, worldZ }
  }

  return (
    <mesh
      geometry={geometry}
      receiveShadow
      castShadow
      onPointerDown={(e) => {
        onTerrainDown?.(toHit(e))
      }}
      onPointerMove={(e) => {
        onTerrainMove?.(toHit(e))
      }}
      onPointerUp={() => onTerrainUp?.()}
    >
      <meshStandardMaterial color="#6f9457" side={THREE.DoubleSide} />
    </mesh>
  )
}

// Both cameras stay mounted permanently and only `makeDefault` toggles between them, with a
// single persistent OrbitControls reacting to whichever camera is currently default. Conditionally
// rendering (mounting/unmounting) the camera+controls subtree per preset instead crashes on
// switch: OrbitControls' underlying THREE.OrbitControls is constructed synchronously during commit
// and can momentarily read an undefined default camera while the old subtree tears down and the
// new one registers.
function CameraRig({ preset }: { preset: CameraPreset }): JSX.Element {
  return (
    <>
      <PerspectiveCamera
        makeDefault={preset === 'orbit'}
        position={[SCENE_SIZE * 0.75, SCENE_SIZE * 0.65, SCENE_SIZE * 0.75]}
        fov={45}
      />
      <OrthographicCamera
        makeDefault={preset === 'topdown'}
        position={[0, 20, 0.001]}
        up={[0, 0, -1]}
        zoom={1}
        left={-SCENE_SIZE * 0.7}
        right={SCENE_SIZE * 0.7}
        top={SCENE_SIZE * 0.7}
        bottom={-SCENE_SIZE * 0.7}
        near={0.1}
        far={100}
      />
      <OrbitControls makeDefault enableRotate={preset === 'orbit'} target={[0, 0, 0]} />
    </>
  )
}

export function MapScene3D({ cameraPreset, children, ...terrainProps }: MapScene3DProps): JSX.Element {
  return (
    <Canvas shadows>
      <color attach="background" args={['#1c2128']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 4]} intensity={1.2} castShadow />
      <CameraRig preset={cameraPreset} />
      <TerrainMesh {...terrainProps} />
      {children}
    </Canvas>
  )
}
