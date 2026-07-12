import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const TERRAIN_RELATIVE_PATH = join('source', 'heightmap.bin')

export async function loadTerrain(
  projectPath: string,
  width: number,
  height: number
): Promise<Float32Array> {
  const file = join(projectPath, TERRAIN_RELATIVE_PATH)
  const count = width * height

  if (existsSync(file)) {
    const buffer = await readFile(file)
    if (buffer.byteLength === count * Float32Array.BYTES_PER_ELEMENT) {
      const view = new Float32Array(buffer.buffer, buffer.byteOffset, count)
      return view.slice() // copy out of Node's pooled Buffer memory before it gets reused
    }
  }

  // No terrain file yet (new project) or its size no longer matches — start from a flat plane.
  return new Float32Array(count).fill(0.5)
}

export async function saveTerrain(projectPath: string, heights: Float32Array): Promise<void> {
  const file = join(projectPath, TERRAIN_RELATIVE_PATH)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength))
}
