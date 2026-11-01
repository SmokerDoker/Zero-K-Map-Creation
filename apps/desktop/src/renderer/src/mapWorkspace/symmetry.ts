import type { Point2D, StartboxConfig, StartboxTeam, MetalSpot } from '@zk-map/map-lua'
import type { MapFeatureInstance } from '@zk-map/shared-types'

/**
 * Map symmetry helpers. Competitive Zero-K maps are almost always symmetric, so the workspace can
 * copy one half of the map onto the other (terrain, mexes, startboxes, features) and optionally
 * mirror brush strokes / placements live while editing.
 *
 * Coordinates are Spring world coordinates: x grows to the east, z grows to the south ("top" of
 * the top-down view is z = 0).
 */

export type SymmetryMode = 'none' | 'mirrorX' | 'mirrorZ' | 'rotate180' | 'diagonal' | 'antiDiagonal'

/** Which half of the map is the "source" that gets copied onto the other half. */
export type SourceSide =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'upperRight'
  | 'lowerLeft'
  | 'upperLeft'
  | 'lowerRight'

export const SYMMETRY_MODES: SymmetryMode[] = ['none', 'mirrorX', 'mirrorZ', 'rotate180', 'diagonal', 'antiDiagonal']

/** Diagonal symmetry swaps the axes, which only maps the grid onto itself on square maps. */
export function isModeAvailable(mode: SymmetryMode, isSquare: boolean): boolean {
  return isSquare || (mode !== 'diagonal' && mode !== 'antiDiagonal')
}

export function sourceSidesFor(mode: SymmetryMode): SourceSide[] {
  switch (mode) {
    case 'mirrorX':
      return ['left', 'right']
    case 'mirrorZ':
      return ['top', 'bottom']
    case 'rotate180':
      return ['left', 'right', 'top', 'bottom']
    case 'diagonal':
      return ['upperRight', 'lowerLeft']
    case 'antiDiagonal':
      return ['upperLeft', 'lowerRight']
    case 'none':
      return []
  }
}

/** Reflections flip polygon winding; a 180° rotation doesn't. */
function isReflection(mode: SymmetryMode): boolean {
  return mode !== 'rotate180' && mode !== 'none'
}

/** Maps a point onto its symmetric counterpart. Every mode is its own inverse. */
export function transformPoint(
  mode: SymmetryMode,
  x: number,
  z: number,
  width: number,
  height: number
): [number, number] {
  switch (mode) {
    case 'mirrorX':
      return [width - x, z]
    case 'mirrorZ':
      return [x, height - z]
    case 'rotate180':
      return [width - x, height - z]
    case 'diagonal':
      return [(z * width) / height, (x * height) / width]
    case 'antiDiagonal':
      return [width - (z * width) / height, height - (x * height) / width]
    case 'none':
      return [x, z]
  }
}

/**
 * Signed distance (in the same units as the inputs) of a point from the symmetry axis: positive
 * inside the source half, negative inside the half that gets overwritten, 0 on the axis.
 */
export function sideValue(side: SourceSide, x: number, z: number, width: number, height: number): number {
  const u = x / width
  const v = z / height
  const scale = Math.max(width, height)
  switch (side) {
    case 'left':
      return width / 2 - x
    case 'right':
      return x - width / 2
    case 'top':
      return height / 2 - z
    case 'bottom':
      return z - height / 2
    case 'upperRight':
      return ((u - v) * scale) / Math.SQRT2
    case 'lowerLeft':
      return ((v - u) * scale) / Math.SQRT2
    case 'upperLeft':
      return ((1 - u - v) * scale) / Math.SQRT2
    case 'lowerRight':
      return ((u + v - 1) * scale) / Math.SQRT2
  }
}

/** Feature heading after the transform (heading vector = (sin θ, cos θ) in x/z). */
export function transformRotation(mode: SymmetryMode, rotation: number): number {
  let r: number
  switch (mode) {
    case 'mirrorX':
      r = -rotation
      break
    case 'mirrorZ':
      r = Math.PI - rotation
      break
    case 'rotate180':
      r = rotation + Math.PI
      break
    case 'diagonal':
      r = Math.PI / 2 - rotation
      break
    case 'antiDiagonal':
      r = -Math.PI / 2 - rotation
      break
    case 'none':
      r = rotation
      break
  }
  const full = Math.PI * 2
  return ((r % full) + full) % full
}

/**
 * Returns a new heightmap where every sample in the target half is copied from its symmetric
 * counterpart in the source half. Grid size is (width x height) samples.
 */
export function mirrorHeights(
  heights: Float32Array,
  gridWidth: number,
  gridHeight: number,
  mode: SymmetryMode,
  side: SourceSide
): Float32Array {
  const out = heights.slice()
  if (mode === 'none') return out
  // Grid coordinates span 0..N; transforming in that space keeps samples exactly on the grid.
  const n = gridWidth - 1
  const m = gridHeight - 1
  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
      const s = sideValue(side, i, j, n, m)
      const [ti, tj] = transformPoint(mode, i, j, n, m)
      const si = Math.round(ti)
      const sj = Math.round(tj)
      const index = j * gridWidth + i
      const sourceIndex = sj * gridWidth + si
      if (s < 0) {
        out[index] = heights[sourceIndex]
      } else if (s === 0 && sourceIndex !== index && sourceIndex < index) {
        // On the split line of a 180° rotation, each sample pairs with another one on the same
        // line; copy within the line too so the result is exactly symmetric.
        out[index] = heights[sourceIndex]
      }
    }
  }
  return out
}

/** Points closer than this to the axis count as "on the axis" and are neither mirrored nor removed. */
export const AXIS_EPSILON_WORLD = 16

interface PointMirrorOptions<T> {
  items: T[]
  position: (item: T) => [number, number]
  /** Builds the mirrored copy of a source item at its new position. */
  mirror: (item: T, x: number, z: number) => T
  mode: SymmetryMode
  side: SourceSide
  width: number
  height: number
}

/** Keeps items in the source half and on the axis, drops items in the target half, and adds a
 * mirrored copy of every source item. */
export function mirrorPointItems<T>({ items, position, mirror, mode, side, width, height }: PointMirrorOptions<T>): T[] {
  if (mode === 'none') return items.slice()
  const kept: T[] = []
  const mirrored: T[] = []
  for (const item of items) {
    const [x, z] = position(item)
    const s = sideValue(side, x, z, width, height)
    if (s < -AXIS_EPSILON_WORLD) continue
    kept.push(item)
    if (s > AXIS_EPSILON_WORLD) {
      const [mx, mz] = transformPoint(mode, x, z, width, height)
      mirrored.push(mirror(item, mx, mz))
    }
  }
  return [...kept, ...mirrored]
}

export function mirrorMetalSpots(
  spots: MetalSpot[],
  mode: SymmetryMode,
  side: SourceSide,
  width: number,
  height: number
): MetalSpot[] {
  return mirrorPointItems({
    items: spots,
    position: (s) => [s.x, s.z],
    mirror: (s, x, z) => ({ ...s, x, z }),
    mode,
    side,
    width,
    height
  })
}

export function mirrorFeatures(
  features: MapFeatureInstance[],
  mode: SymmetryMode,
  side: SourceSide,
  width: number,
  height: number,
  newId: () => string
): MapFeatureInstance[] {
  return mirrorPointItems({
    items: features,
    position: (f) => [f.x, f.z],
    mirror: (f, x, z) => ({ ...f, id: newId(), x, z, rotation: transformRotation(mode, f.rotation) }),
    mode,
    side,
    width,
    height
  })
}

function teamCenter(team: StartboxTeam): [number, number] {
  const points = team.startpoints.length > 0 ? team.startpoints : (team.boxes[0] ?? [])
  if (points.length === 0) return [0, 0]
  let x = 0
  let z = 0
  for (const [px, pz] of points) {
    x += px
    z += pz
  }
  return [x / points.length, z / points.length]
}

function transformTeam(
  team: StartboxTeam,
  mode: SymmetryMode,
  width: number,
  height: number
): Pick<StartboxTeam, 'startpoints' | 'boxes'> {
  const tp = (p: Point2D): Point2D => transformPoint(mode, p[0], p[1], width, height)
  return {
    startpoints: team.startpoints.map(tp),
    boxes: team.boxes.map((box) => {
      const moved = box.map(tp)
      return isReflection(mode) ? moved.reverse() : moved
    })
  }
}

/**
 * Mirrors startboxes: each team in the target half is replaced (in place, keeping its name and
 * ally-team slot) by the mirror image of the matching source team. Source teams without a
 * counterpart get a mirrored team appended; target teams without a counterpart are removed.
 */
export function mirrorStartboxes(
  config: StartboxConfig,
  mode: SymmetryMode,
  side: SourceSide,
  width: number,
  height: number
): StartboxConfig {
  if (mode === 'none') return config
  const sources: StartboxTeam[] = []
  const targetIndices: number[] = []
  config.teams.forEach((team, index) => {
    const [cx, cz] = teamCenter(team)
    const s = sideValue(side, cx, cz, width, height)
    if (s > AXIS_EPSILON_WORLD) sources.push(team)
    else if (s < -AXIS_EPSILON_WORLD) targetIndices.push(index)
  })

  const teams: StartboxTeam[] = []
  let sourceCursor = 0
  config.teams.forEach((team, index) => {
    if (!targetIndices.includes(index)) {
      teams.push(team)
      return
    }
    const source = sources[sourceCursor++]
    if (!source) return // more target teams than source teams: drop the extra ones
    teams.push({ ...team, ...transformTeam(source, mode, width, height) })
  })
  for (; sourceCursor < sources.length; sourceCursor++) {
    const source = sources[sourceCursor]
    const n = teams.length + 1
    teams.push({
      nameLong: `Team ${n}`,
      nameShort: `T${n}`,
      ...transformTeam(source, mode, width, height)
    })
  }
  return { teams, supportedPlayerCounts: [teams.length] }
}

/** For live mirroring: the counterpart of a point, or null if it is (almost) on the axis. */
export function mirrorPartner(
  mode: SymmetryMode,
  x: number,
  z: number,
  width: number,
  height: number
): [number, number] | null {
  if (mode === 'none') return null
  const [mx, mz] = transformPoint(mode, x, z, width, height)
  return Math.hypot(mx - x, mz - z) < AXIS_EPSILON_WORLD ? null : [mx, mz]
}

/** End points of the symmetry axis (or the split line for 180° rotation), for drawing it. */
export function axisSegment(
  mode: SymmetryMode,
  side: SourceSide,
  width: number,
  height: number
): [[number, number], [number, number]] | null {
  switch (mode) {
    case 'mirrorX':
      return [[width / 2, 0], [width / 2, height]]
    case 'mirrorZ':
      return [[0, height / 2], [width, height / 2]]
    case 'rotate180':
      return side === 'left' || side === 'right'
        ? [[width / 2, 0], [width / 2, height]]
        : [[0, height / 2], [width, height / 2]]
    case 'diagonal':
      return [[0, 0], [width, height]]
    case 'antiDiagonal':
      return [[width, 0], [0, height]]
    case 'none':
      return null
  }
}
