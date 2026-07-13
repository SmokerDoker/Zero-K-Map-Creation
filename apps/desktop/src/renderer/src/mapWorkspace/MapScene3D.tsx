import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import {
  computeMeshDecimation,
  computeSceneScale,
  computeWaterLevelNormalized,
  heightToSceneY,
  sceneToWorld,
  SCENE_SIZE
} from './sceneCoords'

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
  /** Map's height range (matches the SMF header) — used to mask the sea-level water mesh. */
  minHeight: number
  maxHeight: number
  cameraPreset: CameraPreset
  onTerrainDown?: (hit: TerrainHit) => void
  onTerrainMove?: (hit: TerrainHit) => void
  onTerrainUp?: () => void
  /** Fired on every hover (regardless of mouse button), null when the pointer leaves the terrain. */
  onTerrainHover?: (hit: TerrainHit | null) => void
  children?: React.ReactNode
}

type TerrainMeshProps = Omit<
  MapScene3DProps,
  'cameraPreset' | 'children' | 'minHeight' | 'maxHeight' | 'onTerrainHover'
> & {
  onTerrainHover?: (hit: TerrainHit | null) => void
}

function TerrainMesh({
  heightsRef,
  heightmapWidth,
  heightmapHeight,
  worldWidth,
  worldHeight,
  version,
  onTerrainDown,
  onTerrainMove,
  onTerrainUp,
  onTerrainHover
}: TerrainMeshProps): JSX.Element {
  const scale = useMemo(() => computeSceneScale(worldWidth, worldHeight), [worldWidth, worldHeight])
  const { strideX, strideY, meshWidth, meshHeight } = useMemo(
    () => computeMeshDecimation(heightmapWidth, heightmapHeight, MAX_PREVIEW_VERTICES),
    [heightmapWidth, heightmapHeight]
  )

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
        // Left button only — right/middle are reserved for OrbitControls (rotate/pan).
        if (e.button !== 0) return
        onTerrainDown?.(toHit(e))
      }}
      onPointerMove={(e) => {
        onTerrainMove?.(toHit(e))
        onTerrainHover?.(toHit(e))
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return
        onTerrainUp?.()
      }}
      onPointerLeave={() => onTerrainHover?.(null)}
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
      <OrbitControls
        makeDefault
        enableRotate={preset === 'orbit'}
        target={[0, 0, 0]}
        // Left is reserved for editing (painting/placing/dragging) — only right/middle drive the
        // camera, so left-click never fights with our own terrain/marker pointer handlers.
        mouseButtons={{ MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
      />
    </>
  )
}

interface WaterMeshProps {
  heightsRef: React.MutableRefObject<Float32Array>
  heightmapWidth: number
  heightmapHeight: number
  worldWidth: number
  worldHeight: number
  minHeight: number
  maxHeight: number
  version: number
}

/**
 * Water mesh masked to the terrain: per the Spring engine wiki, water always sits at world
 * elevation 0 (terrain is placed above/below it purely via minHeight/maxHeight). Rendering that as
 * one flat plane spanning the whole map looks wrong wherever the terrain is above sea level (a
 * mountain still shows blue "underneath" it) — so instead this builds actual geometry on the same
 * decimated grid as the terrain mesh and only includes grid cells whose four corners are all
 * below the water line, leaving true holes wherever the ground doesn't dip underwater.
 */
function WaterMesh({
  heightsRef,
  heightmapWidth,
  heightmapHeight,
  worldWidth,
  worldHeight,
  minHeight,
  maxHeight,
  version
}: WaterMeshProps): JSX.Element | null {
  const scale = useMemo(() => computeSceneScale(worldWidth, worldHeight), [worldWidth, worldHeight])
  const { strideX, strideY, meshWidth, meshHeight } = useMemo(
    () => computeMeshDecimation(heightmapWidth, heightmapHeight, MAX_PREVIEW_VERTICES),
    [heightmapWidth, heightmapHeight]
  )
  const waterLevel = computeWaterLevelNormalized(minHeight, maxHeight)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)

  useEffect(() => {
    if (waterLevel === null) {
      setGeometry(null)
      return
    }

    const heights = heightsRef.current
    const waterY = heightToSceneY(waterLevel)
    const positions = new Float32Array(meshWidth * meshHeight * 3)
    const underwater = new Uint8Array(meshWidth * meshHeight)

    for (let gy = 0; gy < meshHeight; gy++) {
      const srcY = Math.min(gy * strideY, heightmapHeight - 1)
      for (let gx = 0; gx < meshWidth; gx++) {
        const srcX = Math.min(gx * strideX, heightmapWidth - 1)
        const h = heights[srcY * heightmapWidth + srcX] ?? 0.5
        const idx = gy * meshWidth + gx
        positions[idx * 3] = (gx / (meshWidth - 1)) * scale.sceneWidth - scale.sceneWidth / 2
        positions[idx * 3 + 1] = waterY
        positions[idx * 3 + 2] = (gy / (meshHeight - 1)) * scale.sceneDepth - scale.sceneDepth / 2
        underwater[idx] = h < waterLevel ? 1 : 0
      }
    }

    const indices: number[] = []
    for (let gy = 0; gy < meshHeight - 1; gy++) {
      for (let gx = 0; gx < meshWidth - 1; gx++) {
        const a = gy * meshWidth + gx
        const b = a + 1
        const c = a + meshWidth
        const d = c + 1
        if (underwater[a] && underwater[b] && underwater[c] && underwater[d]) {
          indices.push(a, c, b, b, c, d)
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    setGeometry(geo)

    return () => geo.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightmapWidth, heightmapHeight, meshWidth, meshHeight, strideX, strideY, scale, waterLevel, version])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#2f7fb0"
        transparent
        opacity={0.55}
        depthWrite={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}

export function MapScene3D({
  cameraPreset,
  children,
  minHeight,
  maxHeight,
  onTerrainHover,
  ...terrainProps
}: MapScene3DProps): JSX.Element {
  return (
    <Canvas shadows>
      <color attach="background" args={['#1c2128']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 4]} intensity={1.2} castShadow />
      <CameraRig preset={cameraPreset} />
      <TerrainMesh {...terrainProps} onTerrainHover={onTerrainHover} />
      <WaterMesh
        heightsRef={terrainProps.heightsRef}
        heightmapWidth={terrainProps.heightmapWidth}
        heightmapHeight={terrainProps.heightmapHeight}
        worldWidth={terrainProps.worldWidth}
        worldHeight={terrainProps.worldHeight}
        minHeight={minHeight}
        maxHeight={maxHeight}
        version={terrainProps.version}
      />
      {children}
    </Canvas>
  )
}
