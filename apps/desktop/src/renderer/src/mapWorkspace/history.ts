/**
 * Undo/redo history for the map workspace.
 *
 * Two kinds of state are tracked:
 *  - the heightmap, which can be tens of MB, so it is stored as before/after copies of only the
 *    rectangle a stroke actually touched (a `TerrainPatch`);
 *  - everything else (metadata, gameplay settings, startboxes, mexes, features), which is small and
 *    updated immutably, so whole before/after snapshots are just object references.
 *
 * One entry may carry both (e.g. "mirror everything").
 */

export interface TerrainPatch {
  x: number
  y: number
  width: number
  height: number
  before: Float32Array
  after: Float32Array
}

export interface HistoryEntry<Doc> {
  /** Unique, increasing id; used to tell whether the current state equals the saved one. */
  id: number
  label: string
  terrain?: TerrainPatch
  docBefore?: Doc
  docAfter?: Doc
  /** Consecutive doc-only entries with the same key (e.g. typing in one field) merge into one. */
  coalesceKey?: string
  time: number
}

export interface PushOptions {
  coalesceKey?: string
  /** Merge window for coalescing, in ms. */
  coalesceMs?: number
  now?: number
}

const DEFAULT_MAX_ENTRIES = 200
/** Upper bound for heightmap data kept for undo (before + after copies), in bytes. */
const DEFAULT_MAX_TERRAIN_BYTES = 384 * 1024 * 1024

export class History<Doc> {
  private past: HistoryEntry<Doc>[] = []
  private future: HistoryEntry<Doc>[] = []
  private nextId = 1
  private terrainBytes = 0

  constructor(
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly maxTerrainBytes = DEFAULT_MAX_TERRAIN_BYTES
  ) {}

  /** Id of the most recently applied entry, 0 for the initial state. */
  get currentId(): number {
    return this.past.length > 0 ? this.past[this.past.length - 1].id : 0
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  get undoLabel(): string | null {
    return this.past.length > 0 ? this.past[this.past.length - 1].label : null
  }

  get redoLabel(): string | null {
    return this.future.length > 0 ? this.future[this.future.length - 1].label : null
  }

  push(entry: Omit<HistoryEntry<Doc>, 'id' | 'time'>, options: PushOptions = {}): void {
    const now = options.now ?? Date.now()
    const coalesceMs = options.coalesceMs ?? 1000
    for (const dropped of this.future) this.terrainBytes -= patchBytes(dropped.terrain)
    this.future = []

    const last = this.past[this.past.length - 1]
    if (
      options.coalesceKey &&
      last &&
      !last.terrain &&
      !entry.terrain &&
      last.coalesceKey === options.coalesceKey &&
      now - last.time <= coalesceMs
    ) {
      // Keep the original "before", take the newest "after", and give it a fresh id so the
      // workspace sees a state change.
      this.past[this.past.length - 1] = {
        ...last,
        docAfter: entry.docAfter,
        id: this.nextId++,
        time: now
      }
      return
    }

    this.past.push({ ...entry, coalesceKey: options.coalesceKey, id: this.nextId++, time: now })
    this.terrainBytes += patchBytes(entry.terrain)
    this.trim()
  }

  /** Pops the latest entry; the caller applies its "before" side. */
  undo(): HistoryEntry<Doc> | null {
    const entry = this.past.pop()
    if (!entry) return null
    this.future.push(entry)
    return entry
  }

  /** Re-applies the latest undone entry; the caller applies its "after" side. */
  redo(): HistoryEntry<Doc> | null {
    const entry = this.future.pop()
    if (!entry) return null
    this.past.push(entry)
    return entry
  }

  clear(): void {
    this.past = []
    this.future = []
    this.terrainBytes = 0
  }

  private trim(): void {
    while (
      this.past.length > 1 &&
      (this.past.length > this.maxEntries || this.terrainBytes > this.maxTerrainBytes)
    ) {
      const dropped = this.past.shift()
      this.terrainBytes -= patchBytes(dropped?.terrain)
    }
  }
}

function patchBytes(patch: TerrainPatch | undefined): number {
  return patch ? patch.before.byteLength + patch.after.byteLength : 0
}

/** Integer bounding box on the heightmap grid, inclusive on both ends. */
export interface GridRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function expandRect(rect: GridRect | null, other: GridRect): GridRect {
  if (!rect) return { ...other }
  return {
    minX: Math.min(rect.minX, other.minX),
    minY: Math.min(rect.minY, other.minY),
    maxX: Math.max(rect.maxX, other.maxX),
    maxY: Math.max(rect.maxY, other.maxY)
  }
}

function copyRect(src: Float32Array, gridWidth: number, rect: GridRect): Float32Array {
  const w = rect.maxX - rect.minX + 1
  const h = rect.maxY - rect.minY + 1
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const start = (rect.minY + y) * gridWidth + rect.minX
    out.set(src.subarray(start, start + w), y * w)
  }
  return out
}

/** Builds a patch from a full-size "before" snapshot and the current heights, limited to `rect`.
 * Returns null if nothing inside the rectangle actually changed. */
export function createTerrainPatch(
  before: Float32Array,
  after: Float32Array,
  gridWidth: number,
  rect: GridRect
): TerrainPatch | null {
  const beforeRect = copyRect(before, gridWidth, rect)
  const afterRect = copyRect(after, gridWidth, rect)
  let changed = false
  for (let i = 0; i < beforeRect.length; i++) {
    if (beforeRect[i] !== afterRect[i]) {
      changed = true
      break
    }
  }
  if (!changed) return null
  return {
    x: rect.minX,
    y: rect.minY,
    width: rect.maxX - rect.minX + 1,
    height: rect.maxY - rect.minY + 1,
    before: beforeRect,
    after: afterRect
  }
}

/** Writes one side of a patch back into the full heightmap. */
export function applyTerrainPatch(
  heights: Float32Array,
  gridWidth: number,
  patch: TerrainPatch,
  side: 'before' | 'after'
): void {
  const src = patch[side]
  for (let y = 0; y < patch.height; y++) {
    heights.set(src.subarray(y * patch.width, (y + 1) * patch.width), (patch.y + y) * gridWidth + patch.x)
  }
}
