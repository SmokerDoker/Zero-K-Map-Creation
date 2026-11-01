import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  FeatureKind,
  FeatureLayout,
  MapFeatureInstance,
  MapProjectSummary
} from '@zk-map/shared-types'
import { heightmapResolution, mapWorldSize } from '@zk-map/shared-types'
import type { MetalLayout, Point2D, StartboxConfig } from '@zk-map/map-lua'
import type { GameplaySettings } from '../../main/mapconfig'
import type { EditableProjectMetadata } from '../../main/project'
import type { MessageKey } from '../../shared/i18n'
import { MapScene3D, type CameraPreset, type TerrainHit } from './mapWorkspace/MapScene3D'
import { MetalSpotsOverlay } from './mapWorkspace/MetalSpotsOverlay'
import { StartboxesOverlay, TEAM_COLORS, type StartboxHandleTarget } from './mapWorkspace/StartboxesOverlay'
import { FeaturesOverlay } from './mapWorkspace/FeaturesOverlay'
import { BrushCursor } from './mapWorkspace/BrushCursor'
import { SymmetryAxisOverlay } from './mapWorkspace/SymmetryAxisOverlay'
import { applyTerrainBrush, type BrushMode } from './mapWorkspace/terrainBrush'
import { worldToGrid } from './mapWorkspace/sceneCoords'
import {
  History,
  applyTerrainPatch,
  createTerrainPatch,
  expandRect,
  type GridRect,
  type TerrainPatch
} from './mapWorkspace/history'
import {
  SYMMETRY_MODES,
  isModeAvailable,
  mirrorFeatures,
  mirrorHeights,
  mirrorMetalSpots,
  mirrorPartner,
  mirrorStartboxes,
  sourceSidesFor,
  type SourceSide,
  type SymmetryMode
} from './mapWorkspace/symmetry'
import { useI18n } from './i18n'
import { formatError } from './errors'

export interface MapWorkspaceProps {
  project: MapProjectSummary
  onBack: () => void
  onProjectUpdated: (project: MapProjectSummary) => void
}

type WorkspaceMode = 'terrain' | 'metal' | 'startboxes' | 'features' | 'symmetry' | 'mapinfo'

const MODES: WorkspaceMode[] = ['terrain', 'metal', 'startboxes', 'features', 'symmetry', 'mapinfo']
const BRUSH_MODES: BrushMode[] = ['raise', 'lower', 'smooth', 'flatten']
const FEATURE_KINDS: FeatureKind[] = ['tree', 'rock', 'geovent', 'custom']

const GAMEPLAY_FIELDS: { key: keyof GameplaySettings; step?: number; hint?: MessageKey }[] = [
  { key: 'gravity', hint: 'gameplay.gravity.hint' },
  { key: 'tidalStrength', hint: 'gameplay.tidalStrength.hint' },
  { key: 'maxMetal', step: 0.005, hint: 'gameplay.maxMetal.hint' },
  { key: 'extractorRadius', hint: 'gameplay.extractorRadius.hint' },
  { key: 'minWind' },
  { key: 'maxWind' },
  { key: 'minHeight', hint: 'gameplay.minHeight.hint' },
  { key: 'maxHeight', hint: 'gameplay.maxHeight.hint' }
]

const DEFAULT_METAL_YIELD = 2

/** Everything the workspace edits apart from the heightmap. Updated immutably, so undo snapshots
 * are cheap object references. */
interface WorkspaceDoc {
  meta: EditableProjectMetadata
  gameplay: GameplaySettings
  startboxes: StartboxConfig
  metal: MetalLayout
  features: FeatureLayout
}

type MirrorLayer = 'terrain' | 'metal' | 'startboxes' | 'features'
const MIRROR_LAYERS: MirrorLayer[] = ['terrain', 'metal', 'startboxes', 'features']

interface SymmetrySettings {
  mode: SymmetryMode
  side: SourceSide
  live: boolean
  layers: Record<MirrorLayer, boolean>
}

const DEFAULT_SYMMETRY: SymmetrySettings = {
  mode: 'none',
  side: 'left',
  live: false,
  layers: { terrain: true, metal: true, startboxes: true, features: true }
}

function symmetryStorageKey(projectPath: string): string {
  return `zkmc.symmetry:${projectPath}`
}

function loadSymmetrySettings(projectPath: string): SymmetrySettings {
  try {
    const raw = window.localStorage.getItem(symmetryStorageKey(projectPath))
    if (raw) return { ...DEFAULT_SYMMETRY, ...(JSON.parse(raw) as Partial<SymmetrySettings>) }
  } catch {
    // ignore — fall back to defaults
  }
  return DEFAULT_SYMMETRY
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export function MapWorkspace({ project, onBack, onProjectUpdated }: MapWorkspaceProps): JSX.Element {
  const { t } = useI18n()
  const heightmapWidth = heightmapResolution(project.size.width)
  const heightmapHeight = heightmapResolution(project.size.height)
  const worldWidth = mapWorldSize(project.size.width)
  const worldHeight = mapWorldSize(project.size.height)
  const isSquare = project.size.width === project.size.height

  const heightsRef = useRef<Float32Array>(new Float32Array(heightmapWidth * heightmapHeight).fill(0.5))
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const [doc, setDocState] = useState<WorkspaceDoc | null>(null)
  const docRef = useRef<WorkspaceDoc | null>(null)

  const historyRef = useRef(new History<WorkspaceDoc>())
  const [, setHistoryTick] = useState(0)
  const [savedId, setSavedId] = useState(0)

  const [mode, setMode] = useState<WorkspaceMode>('terrain')
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('orbit')

  const [brushMode, setBrushMode] = useState<BrushMode>('raise')
  const [brushRadius, setBrushRadius] = useState(24)
  const [brushStrength, setBrushStrength] = useState(0.04)

  const [symmetry, setSymmetryState] = useState<SymmetrySettings>(() => loadSymmetrySettings(project.projectPath))

  const [activeFeatureKind, setActiveFeatureKind] = useState<FeatureKind>('tree')
  const [selectedMetalIndex, setSelectedMetalIndex] = useState<number | null>(null)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [hoverPoint, setHoverPoint] = useState<TerrainHit | null>(null)

  const isPaintingRef = useRef(false)
  const strokeBeforeRef = useRef<Float32Array | null>(null)
  const strokeRectRef = useRef<GridRect | null>(null)
  const flattenTargetRef = useRef(0.5)
  const [flattenPinned, setFlattenPinned] = useState(false)
  const draggingMetalIndexRef = useRef<number | null>(null)
  const draggingFeatureIdRef = useRef<string | null>(null)
  const draggingStartboxRef = useRef<StartboxHandleTarget | null>(null)
  const gestureRef = useRef<{ label: MessageKey; before: WorkspaceDoc } | null>(null)
  const rafPendingRef = useRef(false)

  const history = historyRef.current
  const dirty = loaded && history.currentId !== savedId

  // ---------------------------------------------------------------------------------------------
  // Loading

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.loadTerrain(project.projectPath, heightmapWidth, heightmapHeight),
      window.api.loadGameplaySettings(project.projectPath),
      window.api.loadStartboxes(project.projectPath, worldWidth, worldHeight),
      window.api.loadMetalLayout(project.projectPath),
      window.api.loadFeatures(project.projectPath)
    ])
      .then(([heightsData, gameplay, startboxes, metal, features]) => {
        if (cancelled) return
        heightsRef.current = heightsData
        const initial: WorkspaceDoc = {
          meta: {
            name: project.name,
            author: project.author,
            description: project.description,
            version: project.version
          },
          gameplay,
          startboxes,
          metal,
          features
        }
        docRef.current = initial
        setDocState(initial)
        historyRef.current.clear()
        setSavedId(historyRef.current.currentId)
        setLoaded(true)
        setVersion((v) => v + 1)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(formatError(err))
      })
    return () => {
      cancelled = true
    }
    // Only reload when a different project is opened, not when its metadata gets saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.projectPath, heightmapWidth, heightmapHeight, worldWidth, worldHeight])

  // ---------------------------------------------------------------------------------------------
  // Document + history plumbing

  function setDoc(next: WorkspaceDoc): void {
    docRef.current = next
    setDocState(next)
  }

  function bumpHistory(): void {
    setHistoryTick((n) => n + 1)
  }

  /** Applies a change to the document as one undoable step. */
  function updateDoc(label: MessageKey, fn: (d: WorkspaceDoc) => WorkspaceDoc, coalesceKey?: string): void {
    const before = docRef.current
    if (!before) return
    const after = fn(before)
    if (after === before) return
    history.push({ label, docBefore: before, docAfter: after }, { coalesceKey })
    setDoc(after)
    bumpHistory()
  }

  /** Live update during a drag; the whole drag becomes one undo step in endGesture(). */
  function updateDocLive(fn: (d: WorkspaceDoc) => WorkspaceDoc): void {
    const current = docRef.current
    if (current) setDoc(fn(current))
  }

  function beginGesture(label: MessageKey): void {
    if (docRef.current) gestureRef.current = { label, before: docRef.current }
  }

  function endGesture(): void {
    const gesture = gestureRef.current
    gestureRef.current = null
    if (!gesture || !docRef.current || gesture.before === docRef.current) return
    history.push({ label: gesture.label, docBefore: gesture.before, docAfter: docRef.current })
    bumpHistory()
  }

  function pushTerrainChange(label: MessageKey, patch: TerrainPatch | null, docBefore?: WorkspaceDoc, docAfter?: WorkspaceDoc): void {
    const docChanged = docBefore !== undefined && docAfter !== undefined && docBefore !== docAfter
    if (!patch && !docChanged) return
    history.push({
      label,
      terrain: patch ?? undefined,
      docBefore: docChanged ? docBefore : undefined,
      docAfter: docChanged ? docAfter : undefined
    })
    bumpHistory()
  }

  const fullRect: GridRect = { minX: 0, minY: 0, maxX: heightmapWidth - 1, maxY: heightmapHeight - 1 }

  /** Replaces the whole heightmap (import, mirroring) as one undoable step. */
  function replaceHeights(next: Float32Array): TerrainPatch | null {
    const patch = createTerrainPatch(heightsRef.current, next, heightmapWidth, fullRect)
    heightsRef.current.set(next)
    scheduleVersionBump()
    return patch
  }

  const undo = useCallback(() => {
    finishInteractions()
    const entry = historyRef.current.undo()
    if (!entry) return
    if (entry.terrain) {
      applyTerrainPatch(heightsRef.current, heightmapWidth, entry.terrain, 'before')
      scheduleVersionBump()
    }
    if (entry.docBefore) setDoc(entry.docBefore)
    bumpHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightmapWidth])

  const redo = useCallback(() => {
    finishInteractions()
    const entry = historyRef.current.redo()
    if (!entry) return
    if (entry.terrain) {
      applyTerrainPatch(heightsRef.current, heightmapWidth, entry.terrain, 'after')
      scheduleVersionBump()
    }
    if (entry.docAfter) setDoc(entry.docAfter)
    bumpHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightmapWidth])

  // ---------------------------------------------------------------------------------------------
  // Saving + unsaved-changes protection

  async function saveAll(): Promise<boolean> {
    const current = docRef.current
    if (!current) return false
    const idAtSave = history.currentId
    setSaveState('saving')
    setError(null)
    try {
      const [updated] = await Promise.all([
        window.api.updateProjectMetadata(project.projectPath, current.meta),
        window.api.saveTerrain(project.projectPath, heightsRef.current),
        window.api.saveGameplaySettings(project.projectPath, current.gameplay),
        window.api.saveStartboxes(project.projectPath, current.startboxes),
        window.api.saveMetalLayout(project.projectPath, current.metal),
        window.api.saveFeatures(project.projectPath, current.features)
      ])
      setSavedId(idAtSave)
      onProjectUpdated(updated)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
      return true
    } catch (err) {
      setSaveState('idle')
      setError(t('workspace.saveFailed', { message: formatError(err) }))
      return false
    }
  }

  // Keep a stable reference for listeners registered once.
  const saveAllRef = useRef(saveAll)
  saveAllRef.current = saveAll

  useEffect(() => {
    void window.api.setDirty(dirty)
  }, [dirty])

  useEffect(() => {
    // "Save" in the native close dialog: save, then let the main process close the window.
    const unsubscribe = window.api.onSaveAndClose(async () => {
      if (await saveAllRef.current()) await window.api.closeAfterSave()
    })
    return () => {
      unsubscribe()
      void window.api.setDirty(false)
    }
  }, [])

  function handleBack(): void {
    finishInteractions()
    if (dirty) setShowLeaveDialog(true)
    else onBack()
  }

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Ctrl/Cmd+S save.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void saveAllRef.current()
        return
      }
      // Leave text fields their own native undo.
      if (isTextEntryTarget(e.target)) return
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  // A drag can end outside the 3D canvas; make sure it still becomes exactly one undo step.
  useEffect(() => {
    const onPointerUp = (): void => finishInteractions()
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  })

  // Clear any in-progress paint/drag when switching modes to avoid cross-mode interference.
  useEffect(() => {
    finishInteractions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  function showNotice(message: string): void {
    setNotice(message)
    setTimeout(() => setNotice((n) => (n === message ? null : n)), 4000)
  }

  // ---------------------------------------------------------------------------------------------
  // Symmetry settings

  function setSymmetry(patch: Partial<SymmetrySettings>): void {
    setSymmetryState((prev) => {
      const next = { ...prev, ...patch }
      const sides = sourceSidesFor(next.mode)
      if (sides.length > 0 && !sides.includes(next.side)) next.side = sides[0]
      if (next.mode === 'none') next.live = false
      try {
        window.localStorage.setItem(symmetryStorageKey(project.projectPath), JSON.stringify(next))
      } catch {
        // not persisted
      }
      return next
    })
  }

  const effectiveSymmetryMode: SymmetryMode = isModeAvailable(symmetry.mode, isSquare) ? symmetry.mode : 'none'
  const liveMirror = symmetry.live && effectiveSymmetryMode !== 'none'

  function applyMirror(): void {
    const before = docRef.current
    if (!before || effectiveSymmetryMode === 'none') return
    const { side, layers } = symmetry
    const m = effectiveSymmetryMode
    let after = before
    if (layers.metal) {
      after = { ...after, metal: { spots: mirrorMetalSpots(after.metal.spots, m, side, worldWidth, worldHeight) } }
    }
    if (layers.startboxes) {
      after = { ...after, startboxes: mirrorStartboxes(after.startboxes, m, side, worldWidth, worldHeight) }
    }
    if (layers.features) {
      after = {
        ...after,
        features: {
          features: mirrorFeatures(after.features.features, m, side, worldWidth, worldHeight, () => crypto.randomUUID())
        }
      }
    }
    const patch = layers.terrain
      ? replaceHeights(mirrorHeights(heightsRef.current, heightmapWidth, heightmapHeight, m, side))
      : null
    setDoc(after)
    setSelectedMetalIndex(null)
    setSelectedFeatureId(null)
    pushTerrainChange('history.mirror', patch, before, after)
    showNotice(t('symmetry.applied'))
  }

  // ---------------------------------------------------------------------------------------------
  // Terrain painting

  function scheduleVersionBump(): void {
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    requestAnimationFrame(() => {
      setVersion((v) => v + 1)
      rafPendingRef.current = false
    })
  }

  function sampleHeight(hit: TerrainHit): number {
    const [gx, gy] = worldToGrid(hit.worldX, hit.worldZ)
    const idx = Math.max(
      0,
      Math.min(heightsRef.current.length - 1, Math.round(gy) * heightmapWidth + Math.round(gx))
    )
    return heightsRef.current[idx]
  }

  function stampAt(worldX: number, worldZ: number): void {
    const [gx, gy] = worldToGrid(worldX, worldZ)
    applyTerrainBrush(
      heightsRef.current,
      heightmapWidth,
      heightmapHeight,
      gx,
      gy,
      brushRadius,
      brushStrength,
      brushMode,
      flattenTargetRef.current
    )
    strokeRectRef.current = expandRect(strokeRectRef.current, {
      minX: Math.max(0, Math.floor(gx - brushRadius)),
      minY: Math.max(0, Math.floor(gy - brushRadius)),
      maxX: Math.min(heightmapWidth - 1, Math.ceil(gx + brushRadius)),
      maxY: Math.min(heightmapHeight - 1, Math.ceil(gy + brushRadius))
    })
  }

  function paintAt(hit: TerrainHit): void {
    stampAt(hit.worldX, hit.worldZ)
    if (liveMirror) {
      const partner = mirrorPartner(effectiveSymmetryMode, hit.worldX, hit.worldZ, worldWidth, worldHeight)
      if (partner) stampAt(partner[0], partner[1])
    }
    scheduleVersionBump()
  }

  function beginStroke(): void {
    const heights = heightsRef.current
    if (!strokeBeforeRef.current || strokeBeforeRef.current.length !== heights.length) {
      strokeBeforeRef.current = new Float32Array(heights.length)
    }
    strokeBeforeRef.current.set(heights)
    strokeRectRef.current = null
    isPaintingRef.current = true
  }

  function endStroke(): void {
    if (!isPaintingRef.current) return
    isPaintingRef.current = false
    const rect = strokeRectRef.current
    const before = strokeBeforeRef.current
    strokeRectRef.current = null
    if (!rect || !before) return
    pushTerrainChange('history.terrainStroke', createTerrainPatch(before, heightsRef.current, heightmapWidth, rect))
  }

  /** Ends any running stroke or drag, committing it to the history. Safe to call repeatedly. */
  function finishInteractions(): void {
    endStroke()
    draggingMetalIndexRef.current = null
    draggingFeatureIdRef.current = null
    draggingStartboxRef.current = null
    endGesture()
  }

  async function handleImportHeightmap(): Promise<void> {
    setError(null)
    try {
      const result = await window.api.importHeightmap(heightmapWidth, heightmapHeight)
      if (!result) return
      pushTerrainChange('history.importHeightmap', replaceHeights(result.heights))
      showNotice(
        result.resampled
          ? t('terrain.imported.resampled', {
              file: result.fileName,
              bits: result.bitDepth,
              from: `${result.sourceWidth}×${result.sourceHeight}`,
              to: `${heightmapWidth}×${heightmapHeight}`
            })
          : t('terrain.imported', { file: result.fileName, bits: result.bitDepth })
      )
    } catch (err) {
      setError(formatError(err))
    }
  }

  async function handleExportHeightmap(): Promise<void> {
    setError(null)
    try {
      const name = (docRef.current?.meta.name ?? project.name).replace(/[\\/:*?"<>|\s]+/g, '_')
      const path = await window.api.exportHeightmap(name, heightsRef.current, heightmapWidth, heightmapHeight)
      if (path) showNotice(t('terrain.exported', { path }))
    } catch (err) {
      setError(formatError(err))
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Pointer handling

  function handleTerrainDown(hit: TerrainHit): void {
    const current = docRef.current
    if (!current) return
    if (mode === 'terrain') {
      if (brushMode === 'flatten') {
        // Alt+Click only pins the reference height (e.g. sampled from dry land next to a lake) —
        // it doesn't paint. Without a pin, each stroke resamples under the cursor, which makes
        // filling a lake impossible if you start the drag inside the water itself.
        if (hit.altKey) {
          flattenTargetRef.current = sampleHeight(hit)
          setFlattenPinned(true)
          return
        }
        if (!flattenPinned) {
          flattenTargetRef.current = sampleHeight(hit)
        }
      }
      beginStroke()
      paintAt(hit)
    } else if (mode === 'metal') {
      const spots = [...current.metal.spots, { x: hit.worldX, z: hit.worldZ, metal: DEFAULT_METAL_YIELD }]
      const newIndex = current.metal.spots.length
      if (liveMirror) {
        const partner = mirrorPartner(effectiveSymmetryMode, hit.worldX, hit.worldZ, worldWidth, worldHeight)
        if (partner) spots.push({ x: partner[0], z: partner[1], metal: DEFAULT_METAL_YIELD })
      }
      updateDoc('history.addMex', (d) => ({ ...d, metal: { spots } }))
      setSelectedMetalIndex(newIndex)
    } else if (mode === 'features') {
      const feature: MapFeatureInstance = {
        id: crypto.randomUUID(),
        typeName: '',
        kind: activeFeatureKind,
        x: hit.worldX,
        z: hit.worldZ,
        rotation: 0,
        scale: 1
      }
      updateDoc('history.addFeature', (d) => ({ ...d, features: { features: [...d.features.features, feature] } }))
      setSelectedFeatureId(feature.id)
    }
  }

  function handleTerrainMove(hit: TerrainHit): void {
    if (mode === 'terrain' && isPaintingRef.current) {
      paintAt(hit)
      return
    }
    if (mode === 'metal' && draggingMetalIndexRef.current !== null) {
      const idx = draggingMetalIndexRef.current
      updateDocLive((d) => ({
        ...d,
        metal: { spots: d.metal.spots.map((s, i) => (i === idx ? { ...s, x: hit.worldX, z: hit.worldZ } : s)) }
      }))
      return
    }
    if (mode === 'features' && draggingFeatureIdRef.current !== null) {
      const id = draggingFeatureIdRef.current
      updateDocLive((d) => ({
        ...d,
        features: {
          features: d.features.features.map((f) => (f.id === id ? { ...f, x: hit.worldX, z: hit.worldZ } : f))
        }
      }))
      return
    }
    if (mode === 'startboxes' && draggingStartboxRef.current) {
      const target = draggingStartboxRef.current
      updateDocLive((d) => {
        const teams = d.startboxes.teams.map((team, ti) => {
          if (ti !== target.team) return team
          if (target.kind === 'start') {
            const startpoints = team.startpoints.slice()
            startpoints[target.index] = [hit.worldX, hit.worldZ]
            return { ...team, startpoints }
          }
          const boxes = team.boxes.map((box, bi) =>
            bi === 0
              ? box.map((p, pi) => (pi === target.index ? ([hit.worldX, hit.worldZ] as Point2D) : p))
              : box
          )
          return { ...team, boxes }
        })
        return { ...d, startboxes: { ...d.startboxes, teams } }
      })
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Panel actions

  function updateSelectedMetal(value: number): void {
    if (selectedMetalIndex === null) return
    updateDoc(
      'history.editMex',
      (d) => ({
        ...d,
        metal: { spots: d.metal.spots.map((s, i) => (i === selectedMetalIndex ? { ...s, metal: value } : s)) }
      }),
      `mex.${selectedMetalIndex}`
    )
  }

  function deleteSelectedMetal(): void {
    if (selectedMetalIndex === null) return
    updateDoc('history.deleteMex', (d) => ({
      ...d,
      metal: { spots: d.metal.spots.filter((_, i) => i !== selectedMetalIndex) }
    }))
    setSelectedMetalIndex(null)
  }

  function updateSelectedFeature(patch: Partial<MapFeatureInstance>, field: string): void {
    if (!selectedFeatureId) return
    updateDoc(
      'history.editFeature',
      (d) => ({
        ...d,
        features: {
          features: d.features.features.map((f) => (f.id === selectedFeatureId ? { ...f, ...patch } : f))
        }
      }),
      `feature.${selectedFeatureId}.${field}`
    )
  }

  function deleteSelectedFeature(): void {
    if (!selectedFeatureId) return
    updateDoc('history.deleteFeature', (d) => ({
      ...d,
      features: { features: d.features.features.filter((f) => f.id !== selectedFeatureId) }
    }))
    setSelectedFeatureId(null)
  }

  function renameStartboxTeam(index: number, name: string): void {
    updateDoc(
      'history.renameTeam',
      (d) => ({
        ...d,
        startboxes: {
          ...d.startboxes,
          teams: d.startboxes.teams.map((team, ti) =>
            ti === index ? { ...team, nameLong: name, nameShort: name.slice(0, 8) || `T${ti + 1}` } : team
          )
        }
      }),
      `team.${index}.name`
    )
  }

  // New teams are spread around a circle (fixed 8-way division) so FFA layouts like Zero-K's
  // "1v1v1v1v1v1v1v1" 8-player maps start with a usable, non-overlapping arrangement — each spot
  // still needs to be dragged onto the mapper's actual intended hill/position afterwards.
  function addStartboxTeam(): void {
    updateDoc('history.addTeam', (d) => {
      const index = d.startboxes.teams.length
      const angle = (2 * Math.PI * index) / 8
      const centerX = worldWidth / 2
      const centerZ = worldHeight / 2
      const orbitRadius = Math.min(worldWidth, worldHeight) * 0.32
      const boxHalf = Math.min(worldWidth, worldHeight) * 0.08
      const cx = centerX + Math.cos(angle) * orbitRadius
      const cz = centerZ + Math.sin(angle) * orbitRadius
      const box: Point2D[] = [
        [cx - boxHalf, cz - boxHalf],
        [cx + boxHalf, cz - boxHalf],
        [cx + boxHalf, cz + boxHalf],
        [cx - boxHalf, cz + boxHalf]
      ]
      const teams = [
        ...d.startboxes.teams,
        {
          nameLong: `Team ${index + 1}`,
          nameShort: `T${index + 1}`,
          startpoints: [[cx, cz] as Point2D],
          boxes: [box]
        }
      ]
      return { ...d, startboxes: { teams, supportedPlayerCounts: [teams.length] } }
    })
  }

  function removeStartboxTeam(index: number): void {
    updateDoc('history.removeTeam', (d) => {
      const teams = d.startboxes.teams.filter((_, ti) => ti !== index)
      return { ...d, startboxes: { teams, supportedPlayerCounts: [teams.length] } }
    })
  }

  function updateGameplayField(key: keyof GameplaySettings, value: number): void {
    updateDoc('history.editMapInfo', (d) => ({ ...d, gameplay: { ...d.gameplay, [key]: value } }), `gameplay.${key}`)
  }

  function updateMetaField(key: keyof EditableProjectMetadata, value: string): void {
    updateDoc('history.editMapInfo', (d) => ({ ...d, meta: { ...d.meta, [key]: value } }), `meta.${key}`)
  }

  // ---------------------------------------------------------------------------------------------
  // Render

  if (loadError) {
    return (
      <div className="app">
        <main>
          <p className="error">{loadError}</p>
          <button onClick={onBack}>{t('common.back')}</button>
        </main>
      </div>
    )
  }

  const metalSpots = doc?.metal.spots ?? []
  const selectedMetalSpot = selectedMetalIndex !== null ? (metalSpots[selectedMetalIndex] ?? null) : null
  const featureList = doc?.features.features ?? []
  const selectedFeature = featureList.find((f) => f.id === selectedFeatureId) ?? null
  const missingTypeCount = featureList.filter((f) => !f.typeName.trim()).length
  const undoLabel = history.undoLabel
  const redoLabel = history.redoLabel

  return (
    <div className="terrain-editor">
      <div className="terrain-toolbar">
        <button className="secondary" onClick={handleBack}>
          {t('common.back')}
        </button>
        <div className="brush-modes">
          {MODES.map((m) => (
            <button key={m} className={m === mode ? 'active' : ''} onClick={() => setMode(m)}>
              {t(`workspace.mode.${m}`)}
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <button
            onClick={undo}
            disabled={!history.canUndo}
            title={undoLabel ? t('workspace.undoWhat', { what: t(undoLabel as MessageKey) }) : t('workspace.undo')}
            aria-label={t('workspace.undo')}
            className="icon-button"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!history.canRedo}
            title={redoLabel ? t('workspace.redoWhat', { what: t(redoLabel as MessageKey) }) : t('workspace.redo')}
            aria-label={t('workspace.redo')}
            className="icon-button"
          >
            ↷
          </button>
        </div>
        <label
          className={`toolbar-toggle ${effectiveSymmetryMode === 'none' ? 'disabled' : ''}`}
          title={effectiveSymmetryMode === 'none' ? t('symmetry.liveDisabledHint') : t('symmetry.liveHint')}
        >
          <input
            type="checkbox"
            checked={liveMirror}
            disabled={effectiveSymmetryMode === 'none'}
            onChange={(e) => setSymmetry({ live: e.target.checked })}
          />
          {t('symmetry.live')}
        </label>
        <button className="secondary" onClick={() => setCameraPreset((p) => (p === 'orbit' ? 'topdown' : 'orbit'))}>
          {cameraPreset === 'orbit' ? t('workspace.camera.topdown') : t('workspace.camera.orbit')}
        </button>
        <div className="toolbar-save">
          <span className={`save-status ${dirty ? 'dirty' : ''}`}>
            {dirty ? t('workspace.unsaved') : t('workspace.allSaved')}
          </span>
          <button onClick={() => void saveAll()} disabled={saveState === 'saving'} title="Ctrl+S">
            {saveState === 'saving'
              ? t('workspace.saving')
              : saveState === 'saved'
                ? t('workspace.saved')
                : t('workspace.save')}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className={`workspace-banner ${error ? 'error' : ''}`}>
          <span>{error ?? notice}</span>
          <button className="link-button" onClick={() => (error ? setError(null) : setNotice(null))}>
            ✕
          </button>
        </div>
      )}

      {!loaded || !doc ? (
        <p className="loading">{t('workspace.loading')}</p>
      ) : (
        <div className="terrain-panes">
          <div className="terrain-pane">
            <MapScene3D
              heightsRef={heightsRef}
              heightmapWidth={heightmapWidth}
              heightmapHeight={heightmapHeight}
              worldWidth={worldWidth}
              worldHeight={worldHeight}
              version={version}
              minHeight={doc.gameplay.minHeight}
              maxHeight={doc.gameplay.maxHeight}
              cameraPreset={cameraPreset}
              onTerrainDown={handleTerrainDown}
              onTerrainMove={handleTerrainMove}
              onTerrainUp={finishInteractions}
              onTerrainHover={setHoverPoint}
            >
              {(mode === 'symmetry' || liveMirror) && (
                <SymmetryAxisOverlay
                  mode={effectiveSymmetryMode}
                  side={symmetry.side}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                />
              )}
              {mode === 'terrain' && (
                <BrushCursor
                  hover={hoverPoint}
                  radius={brushRadius}
                  heights={heightsRef.current}
                  heightmapWidth={heightmapWidth}
                  heightmapHeight={heightmapHeight}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                />
              )}
              {mode === 'metal' && (
                <MetalSpotsOverlay
                  layout={doc.metal}
                  heights={heightsRef.current}
                  heightmapWidth={heightmapWidth}
                  heightmapHeight={heightmapHeight}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                  selectedIndex={selectedMetalIndex}
                  onMarkerDown={(i) => {
                    beginGesture('history.moveMex')
                    draggingMetalIndexRef.current = i
                    setSelectedMetalIndex(i)
                  }}
                />
              )}
              {mode === 'startboxes' && (
                <StartboxesOverlay
                  config={doc.startboxes}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                  onHandleDown={(target) => {
                    beginGesture('history.moveStartbox')
                    draggingStartboxRef.current = target
                  }}
                />
              )}
              {mode === 'features' && (
                <FeaturesOverlay
                  layout={doc.features}
                  heights={heightsRef.current}
                  heightmapWidth={heightmapWidth}
                  heightmapHeight={heightmapHeight}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                  selectedId={selectedFeatureId}
                  onMarkerDown={(id) => {
                    beginGesture('history.moveFeature')
                    draggingFeatureIdRef.current = id
                    setSelectedFeatureId(id)
                  }}
                />
              )}
            </MapScene3D>
          </div>

          <div className="metal-side-panel">
            {mode === 'terrain' && (
              <>
                <p className="hint">{t('terrain.hint')}</p>
                <div className="brush-modes vertical">
                  {BRUSH_MODES.map((m) => (
                    <button key={m} className={m === brushMode ? 'active' : ''} onClick={() => setBrushMode(m)}>
                      {t(`terrain.brush.${m}`)}
                    </button>
                  ))}
                </div>
                {brushMode === 'flatten' && (
                  <p className="hint">
                    {flattenPinned ? t('terrain.flatten.pinned') : t('terrain.flatten.howTo')}
                    {flattenPinned && (
                      <button className="link-button" onClick={() => setFlattenPinned(false)}>
                        {t('terrain.flatten.unpin')}
                      </button>
                    )}
                  </p>
                )}
                <label className="slider">
                  {t('terrain.radius')}
                  <input
                    type="range"
                    min={4}
                    max={80}
                    value={brushRadius}
                    onChange={(e) => setBrushRadius(Number(e.target.value))}
                  />
                </label>
                <label className="slider">
                  {t('terrain.strength')}
                  <input
                    type="range"
                    min={0.005}
                    max={0.15}
                    step={0.005}
                    value={brushStrength}
                    onChange={(e) => setBrushStrength(Number(e.target.value))}
                  />
                </label>
                {liveMirror && <p className="hint">{t('symmetry.liveActive')}</p>}
                <div className="panel-section">
                  <h3>{t('terrain.heightmap')}</h3>
                  <button onClick={() => void handleImportHeightmap()}>{t('terrain.import')}</button>
                  <button onClick={() => void handleExportHeightmap()}>{t('terrain.export')}</button>
                  <p className="hint">
                    {t('terrain.heightmapHint', { width: heightmapWidth, height: heightmapHeight })}
                  </p>
                </div>
              </>
            )}

            {mode === 'metal' && (
              <>
                <p className="hint">{t('metal.hint')}</p>
                {!selectedMetalSpot ? (
                  <p className="hint">{t('metal.noneSelected')}</p>
                ) : (
                  <>
                    <label className="form-field">
                      {t('metal.yield')}
                      <input
                        type="number"
                        step={0.5}
                        value={selectedMetalSpot.metal ?? DEFAULT_METAL_YIELD}
                        onChange={(e) => updateSelectedMetal(Number(e.target.value))}
                      />
                    </label>
                    <button onClick={deleteSelectedMetal}>{t('metal.delete')}</button>
                  </>
                )}
                {liveMirror && <p className="hint">{t('symmetry.liveActive')}</p>}
                <p className="hint">{t('metal.count', { count: metalSpots.length })}</p>
              </>
            )}

            {mode === 'startboxes' && (
              <>
                <p className="hint">{t('startboxes.hint')}</p>
                <div className="startbox-legend">
                  {doc.startboxes.teams.map((team, ti) => (
                    <div key={ti} className="legend-row">
                      <span className="legend-swatch" style={{ background: TEAM_COLORS[ti % TEAM_COLORS.length] }} />
                      <input value={team.nameLong} onChange={(e) => renameStartboxTeam(ti, e.target.value)} />
                      <button
                        onClick={() => removeStartboxTeam(ti)}
                        disabled={doc.startboxes.teams.length <= 1}
                        title={t('startboxes.remove')}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addStartboxTeam}>{t('startboxes.add')}</button>
                <p className="hint">{t('startboxes.ffaHint')}</p>
              </>
            )}

            {mode === 'features' && (
              <>
                <p className="hint">{t('features.hint')}</p>
                <div className="brush-modes vertical">
                  {FEATURE_KINDS.map((kind) => (
                    <button
                      key={kind}
                      className={kind === activeFeatureKind ? 'active' : ''}
                      onClick={() => setActiveFeatureKind(kind)}
                    >
                      {t(`features.kind.${kind}`)}
                    </button>
                  ))}
                </div>
                {!selectedFeature ? (
                  <p className="hint">{t('features.noneSelected')}</p>
                ) : (
                  <>
                    <label className="form-field">
                      {t('features.typeName')}
                      <input
                        value={selectedFeature.typeName}
                        placeholder={t('features.typeName.placeholder')}
                        onChange={(e) => updateSelectedFeature({ typeName: e.target.value }, 'typeName')}
                      />
                      {!selectedFeature.typeName.trim() && (
                        <span className="hint warning">{t('features.typeName.warning')}</span>
                      )}
                    </label>
                    <label className="form-field">
                      {t('features.kind')}
                      <select
                        value={selectedFeature.kind}
                        onChange={(e) => updateSelectedFeature({ kind: e.target.value as FeatureKind }, 'kind')}
                      >
                        {FEATURE_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {t(`features.kind.${kind}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      {t('features.rotation', { degrees: Math.round((selectedFeature.rotation * 180) / Math.PI) })}
                      <input
                        type="range"
                        min={0}
                        max={359}
                        value={Math.round((selectedFeature.rotation * 180) / Math.PI)}
                        onChange={(e) =>
                          updateSelectedFeature({ rotation: (Number(e.target.value) * Math.PI) / 180 }, 'rotation')
                        }
                      />
                    </label>
                    <label className="form-field">
                      {t('features.scale', { scale: selectedFeature.scale.toFixed(2) })}
                      <input
                        type="range"
                        min={0.5}
                        max={3}
                        step={0.05}
                        value={selectedFeature.scale}
                        onChange={(e) => updateSelectedFeature({ scale: Number(e.target.value) }, 'scale')}
                      />
                    </label>
                    <button onClick={deleteSelectedFeature}>{t('features.delete')}</button>
                  </>
                )}
                <p className="hint">
                  {t('features.count', { count: featureList.length })}
                  {missingTypeCount > 0 && ` · ${t('features.missingType', { count: missingTypeCount })}`}
                </p>
              </>
            )}

            {mode === 'symmetry' && (
              <>
                <p className="hint">{t('symmetry.intro')}</p>
                <label className="form-field">
                  {t('symmetry.type')}
                  <select
                    value={effectiveSymmetryMode}
                    onChange={(e) => setSymmetry({ mode: e.target.value as SymmetryMode })}
                  >
                    {SYMMETRY_MODES.filter((m) => isModeAvailable(m, isSquare)).map((m) => (
                      <option key={m} value={m}>
                        {t(`symmetry.mode.${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {!isSquare && <p className="hint">{t('symmetry.diagonalSquareOnly')}</p>}
                {effectiveSymmetryMode !== 'none' && (
                  <>
                    <label className="form-field">
                      {t('symmetry.source')}
                      <select
                        value={symmetry.side}
                        onChange={(e) => setSymmetry({ side: e.target.value as SourceSide })}
                      >
                        {sourceSidesFor(effectiveSymmetryMode).map((s) => (
                          <option key={s} value={s}>
                            {t(`symmetry.side.${s}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="checkbox-list">
                      <legend>{t('symmetry.layers')}</legend>
                      {MIRROR_LAYERS.map((layer) => (
                        <label key={layer}>
                          <input
                            type="checkbox"
                            checked={symmetry.layers[layer]}
                            onChange={(e) =>
                              setSymmetry({ layers: { ...symmetry.layers, [layer]: e.target.checked } })
                            }
                          />
                          {t(`symmetry.layer.${layer}`)}
                        </label>
                      ))}
                    </fieldset>
                    <button
                      onClick={applyMirror}
                      disabled={!MIRROR_LAYERS.some((layer) => symmetry.layers[layer])}
                    >
                      {t('symmetry.apply')}
                    </button>
                    <p className="hint">{t('symmetry.applyHint')}</p>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={liveMirror}
                        onChange={(e) => setSymmetry({ live: e.target.checked })}
                      />
                      {t('symmetry.live')}
                    </label>
                    <p className="hint">{t('symmetry.liveHint')}</p>
                  </>
                )}
              </>
            )}

            {mode === 'mapinfo' && (
              <div className="form-grid vertical">
                <h3>{t('mapinfo.general')}</h3>
                <label className="form-field">
                  {t('mapinfo.name')}
                  <input value={doc.meta.name} onChange={(e) => updateMetaField('name', e.target.value)} />
                  {!doc.meta.name.trim() && <span className="hint warning">{t('mapinfo.name.required')}</span>}
                </label>
                <label className="form-field">
                  {t('mapinfo.version')}
                  <input value={doc.meta.version} onChange={(e) => updateMetaField('version', e.target.value)} />
                  <span className={`hint ${doc.meta.version.trim() ? '' : 'warning'}`}>
                    {doc.meta.version.trim() ? t('mapinfo.version.hint') : t('mapinfo.version.required')}
                  </span>
                </label>
                <label className="form-field">
                  {t('mapinfo.author')}
                  <input value={doc.meta.author} onChange={(e) => updateMetaField('author', e.target.value)} />
                </label>
                <label className="form-field">
                  {t('mapinfo.description')}
                  <textarea
                    rows={3}
                    value={doc.meta.description}
                    onChange={(e) => updateMetaField('description', e.target.value)}
                  />
                </label>

                <h3>{t('mapinfo.gameplay')}</h3>
                {GAMEPLAY_FIELDS.map(({ key, step, hint }) => (
                  <label key={key} className="form-field">
                    {t(`gameplay.${key}`)}
                    <input
                      type="number"
                      step={step ?? 1}
                      value={doc.gameplay[key]}
                      onChange={(e) => updateGameplayField(key, Number(e.target.value))}
                    />
                    {hint && <span className="hint">{t(hint)}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showLeaveDialog && (
        <div className="dialog-backdrop">
          <div className="dialog" role="alertdialog" aria-labelledby="leave-title">
            <h2 id="leave-title">{t('unsaved.title')}</h2>
            <p>{t('unsaved.message')}</p>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={() => setShowLeaveDialog(false)}>
                {t('unsaved.cancel')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setShowLeaveDialog(false)
                  onBack()
                }}
              >
                {t('unsaved.discard')}
              </button>
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  if (await saveAll()) {
                    setShowLeaveDialog(false)
                    onBack()
                  } else {
                    setShowLeaveDialog(false)
                  }
                }}
              >
                {t('unsaved.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
