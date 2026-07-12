import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

export interface TerrainPreview3DProps {
  heightsRef: React.MutableRefObject<Float32Array>
  width: number
  height: number
  /** Bumped whenever the heightmap data changes, to trigger a mesh update. */
  version: number
}

/** Cap on the displayed mesh resolution per axis — full-res data can be in the hundreds, which is
 * fine for the 2D canvas but too many vertices to rebuild smoothly every brush stroke. */
const MAX_PREVIEW_VERTICES = 129

const WORLD_SIZE = 12
const HEIGHT_SCALE = 3

function TerrainMesh({ heightsRef, width, height, version }: TerrainPreview3DProps): JSX.Element {
  const strideX = Math.max(1, Math.ceil((width - 1) / (MAX_PREVIEW_VERTICES - 1)))
  const strideY = Math.max(1, Math.ceil((height - 1) / (MAX_PREVIEW_VERTICES - 1)))
  const meshWidth = Math.floor((width - 1) / strideX) + 1
  const meshHeight = Math.floor((height - 1) / strideY) + 1

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      WORLD_SIZE,
      WORLD_SIZE,
      meshWidth - 1,
      meshHeight - 1
    )
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [meshWidth, meshHeight])

  useEffect(() => {
    const position = geometry.attributes.position as THREE.BufferAttribute
    const heights = heightsRef.current
    for (let y = 0; y < meshHeight; y++) {
      const srcY = Math.min(y * strideY, height - 1)
      for (let x = 0; x < meshWidth; x++) {
        const srcX = Math.min(x * strideX, width - 1)
        const h = heights[srcY * width + srcX] ?? 0.5
        position.setY(y * meshWidth + x, (h - 0.5) * HEIGHT_SCALE)
      }
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
    // `version` is intentionally the trigger for re-running this effect on every brush stroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, meshWidth, meshHeight, strideX, strideY, width, height, version])

  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial color="#6f9457" side={THREE.DoubleSide} />
    </mesh>
  )
}

export function TerrainPreview3D(props: TerrainPreview3DProps): JSX.Element {
  return (
    <Canvas shadows camera={{ position: [9, 8, 9], fov: 45 }}>
      <color attach="background" args={['#1c2128']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 4]} intensity={1.2} castShadow />
      <TerrainMesh {...props} />
      <OrbitControls makeDefault />
    </Canvas>
  )
}
