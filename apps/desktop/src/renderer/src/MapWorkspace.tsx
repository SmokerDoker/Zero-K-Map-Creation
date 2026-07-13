import { useEffect, useRef, useState } from 'react'
import type {
  FeatureKind,
  FeatureLayout,
  MapFeatureInstance,
  MapProjectSummary
} from '@zk-map/shared-types'
import { heightmapResolution, mapWorldSize } from '@zk-map/shared-types'
import type { MetalLayout, Point2D, StartboxConfig } from '@zk-map/map-lua'
import type { GameplaySettings } from '../../main/mapconfig'
import { MapScene3D, type CameraPreset, type TerrainHit } from './mapWorkspace/MapScene3D'
import { MetalSpotsOverlay } from './mapWorkspace/MetalSpotsOverlay'
import { StartboxesOverlay, TEAM_COLORS, type StartboxHandleTarget } from './mapWorkspace/StartboxesOverlay'
import { FeaturesOverlay } from './mapWorkspace/FeaturesOverlay'
import { applyTerrainBrush, type BrushMode } from './mapWorkspace/terrainBrush'
import { worldToGrid } from './mapWorkspace/sceneCoords'

export interface MapWorkspaceProps {
  project: MapProjectSummary
  onBack: () => void
}

type WorkspaceMode = 'terrain' | 'metal' | 'startboxes' | 'features' | 'mapinfo'

const MODE_LABELS: { mode: WorkspaceMode; label: string }[] = [
  { mode: 'terrain', label: 'Terrain' },
  { mode: 'metal', label: 'Mexes' },
  { mode: 'startboxes', label: 'Startboxen' },
  { mode: 'features', label: 'Features' },
  { mode: 'mapinfo', label: 'Kartendaten' }
]

const BRUSH_MODES: { mode: BrushMode; label: string }[] = [
  { mode: 'raise', label: 'Anheben' },
  { mode: 'lower', label: 'Absenken' },
  { mode: 'smooth', label: 'Glätten' },
  { mode: 'flatten', label: 'Ebnen' }
]

const FEATURE_KIND_LABELS: Record<FeatureKind, string> = {
  tree: 'Baum',
  rock: 'Stein',
  geovent: 'Geysir',
  custom: 'Sonstiges'
}

const GAMEPLAY_FIELD_LABELS: { key: keyof GameplaySettings; label: string; step?: number; hint?: string }[] = [
  { key: 'gravity', label: 'Gravitation', hint: 'Standard: 130' },
  { key: 'tidalStrength', label: 'Gezeitenstärke', hint: 'Energie pro Tidal-Generator, 0 = kein Wasser-Bonus' },
  { key: 'maxMetal', label: 'Max. Metall pro Fläche', step: 0.005, hint: 'Standard: 0.02' },
  { key: 'extractorRadius', label: 'Extraktor-Radius', hint: 'Standard: 500' },
  { key: 'minWind', label: 'Wind (min.)' },
  { key: 'maxWind', label: 'Wind (max.)' },
  { key: 'minHeight', label: 'Minimale Höhe', hint: 'Muss zur Heightmap passen' },
  { key: 'maxHeight', label: 'Maximale Höhe', hint: 'Muss zur Heightmap passen' }
]

const DEFAULT_METAL_YIELD = 2

export function MapWorkspace({ project, onBack }: MapWorkspaceProps): JSX.Element {
  const heightmapWidth = heightmapResolution(project.size.width)
  const heightmapHeight = heightmapResolution(project.size.height)
  const worldWidth = mapWorldSize(project.size.width)
  const worldHeight = mapWorldSize(project.size.height)

  const heightsRef = useRef<Float32Array>(new Float32Array(heightmapWidth * heightmapHeight).fill(0.5))
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)

  const [gameplay, setGameplay] = useState<GameplaySettings | null>(null)
  const [startboxes, setStartboxes] = useState<StartboxConfig | null>(null)
  const [metalLayout, setMetalLayout] = useState<MetalLayout | null>(null)
  const [features, setFeatures] = useState<FeatureLayout | null>(null)

  const [mode, setMode] = useState<WorkspaceMode>('terrain')
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('orbit')

  const [brushMode, setBrushMode] = useState<BrushMode>('raise')
  const [brushRadius, setBrushRadius] = useState(24)
  const [brushStrength, setBrushStrength] = useState(0.04)

  const [activeFeatureKind, setActiveFeatureKind] = useState<FeatureKind>('tree')
  const [selectedMetalIndex, setSelectedMetalIndex] = useState<number | null>(null)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const isPaintingRef = useRef(false)
  const flattenTargetRef = useRef(0.5)
  const draggingMetalIndexRef = useRef<number | null>(null)
  const draggingFeatureIdRef = useRef<string | null>(null)
  const draggingStartboxRef = useRef<StartboxHandleTarget | null>(null)
  const rafPendingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.loadTerrain(project.projectPath, heightmapWidth, heightmapHeight),
      window.api.loadGameplaySettings(project.projectPath),
      window.api.loadStartboxes(project.projectPath, worldWidth, worldHeight),
      window.api.loadMetalLayout(project.projectPath),
      window.api.loadFeatures(project.projectPath)
    ]).then(([heightsData, gameplayData, startboxData, metalData, featureData]) => {
      if (cancelled) return
      heightsRef.current = heightsData
      setGameplay(gameplayData)
      setStartboxes(startboxData)
      setMetalLayout(metalData)
      setFeatures(featureData)
      setLoaded(true)
      setVersion((v) => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [project.projectPath, heightmapWidth, heightmapHeight, worldWidth, worldHeight])

  // Clear any in-progress paint/drag when switching modes to avoid cross-mode interference.
  useEffect(() => {
    isPaintingRef.current = false
    draggingMetalIndexRef.current = null
    draggingFeatureIdRef.current = null
    draggingStartboxRef.current = null
  }, [mode])

  async function handleSaveAll(): Promise<void> {
    setSaveState('saving')
    await Promise.all([
      window.api.saveTerrain(project.projectPath, heightsRef.current),
      gameplay ? window.api.saveGameplaySettings(project.projectPath, gameplay) : Promise.resolve(),
      startboxes ? window.api.saveStartboxes(project.projectPath, startboxes) : Promise.resolve(),
      metalLayout ? window.api.saveMetalLayout(project.projectPath, metalLayout) : Promise.resolve(),
      features ? window.api.saveFeatures(project.projectPath, features) : Promise.resolve()
    ])
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  function scheduleVersionBump(): void {
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    requestAnimationFrame(() => {
      setVersion((v) => v + 1)
      rafPendingRef.current = false
    })
  }

  function paintAt(hit: TerrainHit): void {
    const [gx, gy] = worldToGrid(hit.worldX, hit.worldZ)
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
    scheduleVersionBump()
  }

  function handleTerrainDown(hit: TerrainHit): void {
    if (mode === 'terrain') {
      isPaintingRef.current = true
      if (brushMode === 'flatten') {
        const [gx, gy] = worldToGrid(hit.worldX, hit.worldZ)
        const idx = Math.max(
          0,
          Math.min(heightsRef.current.length - 1, Math.round(gy) * heightmapWidth + Math.round(gx))
        )
        flattenTargetRef.current = heightsRef.current[idx]
      }
      paintAt(hit)
    } else if (mode === 'metal' && metalLayout) {
      const newIndex = metalLayout.spots.length
      setMetalLayout({ spots: [...metalLayout.spots, { x: hit.worldX, z: hit.worldZ, metal: DEFAULT_METAL_YIELD }] })
      setSelectedMetalIndex(newIndex)
    } else if (mode === 'features' && features) {
      const feature: MapFeatureInstance = {
        id: crypto.randomUUID(),
        typeName: '',
        kind: activeFeatureKind,
        x: hit.worldX,
        z: hit.worldZ,
        rotation: 0,
        scale: 1
      }
      setFeatures({ features: [...features.features, feature] })
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
      setMetalLayout((prev) =>
        prev ? { spots: prev.spots.map((s, i) => (i === idx ? { ...s, x: hit.worldX, z: hit.worldZ } : s)) } : prev
      )
      return
    }
    if (mode === 'features' && draggingFeatureIdRef.current !== null) {
      const id = draggingFeatureIdRef.current
      setFeatures((prev) =>
        prev ? { features: prev.features.map((f) => (f.id === id ? { ...f, x: hit.worldX, z: hit.worldZ } : f)) } : prev
      )
      return
    }
    if (mode === 'startboxes' && draggingStartboxRef.current) {
      const target = draggingStartboxRef.current
      setStartboxes((prev) => {
        if (!prev) return prev
        const teams = prev.teams.map((team, ti) => {
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
        return { ...prev, teams }
      })
    }
  }

  function handleTerrainUp(): void {
    isPaintingRef.current = false
    draggingMetalIndexRef.current = null
    draggingFeatureIdRef.current = null
    draggingStartboxRef.current = null
  }

  function updateSelectedMetal(value: number): void {
    if (selectedMetalIndex === null) return
    setMetalLayout((prev) =>
      prev ? { spots: prev.spots.map((s, i) => (i === selectedMetalIndex ? { ...s, metal: value } : s)) } : prev
    )
  }

  function deleteSelectedMetal(): void {
    if (selectedMetalIndex === null) return
    setMetalLayout((prev) => (prev ? { spots: prev.spots.filter((_, i) => i !== selectedMetalIndex) } : prev))
    setSelectedMetalIndex(null)
  }

  function updateSelectedFeature(patch: Partial<MapFeatureInstance>): void {
    if (!selectedFeatureId) return
    setFeatures((prev) =>
      prev ? { features: prev.features.map((f) => (f.id === selectedFeatureId ? { ...f, ...patch } : f)) } : prev
    )
  }

  function deleteSelectedFeature(): void {
    if (!selectedFeatureId) return
    setFeatures((prev) => (prev ? { features: prev.features.filter((f) => f.id !== selectedFeatureId) } : prev))
    setSelectedFeatureId(null)
  }

  function renameStartboxTeam(index: number, name: string): void {
    setStartboxes((prev) => {
      if (!prev) return prev
      const teams = prev.teams.map((team, ti) =>
        ti === index ? { ...team, nameLong: name, nameShort: name.slice(0, 8) || `T${ti + 1}` } : team
      )
      return { ...prev, teams }
    })
  }

  function updateGameplayField(key: keyof GameplaySettings, value: number): void {
    setGameplay((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const selectedMetalSpot =
    metalLayout && selectedMetalIndex !== null ? metalLayout.spots[selectedMetalIndex] : null
  const selectedFeature = features?.features.find((f) => f.id === selectedFeatureId) ?? null
  const missingTypeCount = features?.features.filter((f) => !f.typeName.trim()).length ?? 0

  return (
    <div className="terrain-editor">
      <div className="terrain-toolbar">
        <button onClick={onBack}>← Zurück</button>
        <div className="brush-modes">
          {MODE_LABELS.map(({ mode: m, label }) => (
            <button key={m} className={m === mode ? 'active' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setCameraPreset((p) => (p === 'orbit' ? 'topdown' : 'orbit'))}>
          {cameraPreset === 'orbit' ? '⤓ Draufsicht' : '⟳ Frei drehen'}
        </button>
        <button onClick={handleSaveAll} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Speichert…' : saveState === 'saved' ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>

      {!loaded ? (
        <p className="loading">Lade Karte…</p>
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
              cameraPreset={cameraPreset}
              onTerrainDown={handleTerrainDown}
              onTerrainMove={handleTerrainMove}
              onTerrainUp={handleTerrainUp}
            >
              {mode === 'metal' && metalLayout && (
                <MetalSpotsOverlay
                  layout={metalLayout}
                  heights={heightsRef.current}
                  heightmapWidth={heightmapWidth}
                  heightmapHeight={heightmapHeight}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                  selectedIndex={selectedMetalIndex}
                  onMarkerDown={(i) => {
                    draggingMetalIndexRef.current = i
                    setSelectedMetalIndex(i)
                  }}
                />
              )}
              {mode === 'startboxes' && startboxes && (
                <StartboxesOverlay
                  config={startboxes}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                  onHandleDown={(target) => {
                    draggingStartboxRef.current = target
                  }}
                />
              )}
              {mode === 'features' && features && (
                <FeaturesOverlay
                  layout={features}
                  heights={heightsRef.current}
                  heightmapWidth={heightmapWidth}
                  heightmapHeight={heightmapHeight}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                  selectedId={selectedFeatureId}
                  onMarkerDown={(id) => {
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
                <p className="hint">Ziehen auf dem Gelände = malen.</p>
                <div className="brush-modes vertical">
                  {BRUSH_MODES.map(({ mode: m, label }) => (
                    <button key={m} className={m === brushMode ? 'active' : ''} onClick={() => setBrushMode(m)}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="slider">
                  Radius
                  <input
                    type="range"
                    min={4}
                    max={80}
                    value={brushRadius}
                    onChange={(e) => setBrushRadius(Number(e.target.value))}
                  />
                </label>
                <label className="slider">
                  Stärke
                  <input
                    type="range"
                    min={0.005}
                    max={0.15}
                    step={0.005}
                    value={brushStrength}
                    onChange={(e) => setBrushStrength(Number(e.target.value))}
                  />
                </label>
              </>
            )}

            {mode === 'metal' && (
              <>
                <p className="hint">Klick auf die Karte = Mex platzieren · Ziehen = verschieben.</p>
                {!selectedMetalSpot ? (
                  <p className="hint">Kein Mex ausgewählt.</p>
                ) : (
                  <>
                    <label className="form-field">
                      Metallertrag
                      <input
                        type="number"
                        step={0.5}
                        value={selectedMetalSpot.metal ?? DEFAULT_METAL_YIELD}
                        onChange={(e) => updateSelectedMetal(Number(e.target.value))}
                      />
                    </label>
                    <button onClick={deleteSelectedMetal}>Spot löschen</button>
                  </>
                )}
                <p className="hint">{metalLayout?.spots.length ?? 0} Spot(s) insgesamt</p>
              </>
            )}

            {mode === 'startboxes' && startboxes && (
              <>
                <p className="hint">Ecken und Startpunkte auf der Karte ziehen.</p>
                <div className="startbox-legend">
                  {startboxes.teams.map((team, ti) => (
                    <label key={ti} className="legend-row">
                      <span className="legend-swatch" style={{ background: TEAM_COLORS[ti % TEAM_COLORS.length] }} />
                      <input value={team.nameLong} onChange={(e) => renameStartboxTeam(ti, e.target.value)} />
                    </label>
                  ))}
                </div>
              </>
            )}

            {mode === 'features' && (
              <>
                <p className="hint">Klick = platzieren · Ziehen = verschieben.</p>
                <div className="brush-modes vertical">
                  {(Object.keys(FEATURE_KIND_LABELS) as FeatureKind[]).map((kind) => (
                    <button
                      key={kind}
                      className={kind === activeFeatureKind ? 'active' : ''}
                      onClick={() => setActiveFeatureKind(kind)}
                    >
                      {FEATURE_KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>
                {!selectedFeature ? (
                  <p className="hint">Kein Feature ausgewählt.</p>
                ) : (
                  <>
                    <label className="form-field">
                      Typname
                      <input
                        value={selectedFeature.typeName}
                        placeholder="z.B. TreeType0 (FeatureDef deiner Karte)"
                        onChange={(e) => updateSelectedFeature({ typeName: e.target.value })}
                      />
                      {!selectedFeature.typeName.trim() && (
                        <span className="hint warning">
                          Muss exakt zu einem FeatureDef deiner Karte passen, sonst erscheint das Objekt
                          nicht im Spiel.
                        </span>
                      )}
                    </label>
                    <label className="form-field">
                      Art
                      <select
                        value={selectedFeature.kind}
                        onChange={(e) => updateSelectedFeature({ kind: e.target.value as FeatureKind })}
                      >
                        {(Object.keys(FEATURE_KIND_LABELS) as FeatureKind[]).map((kind) => (
                          <option key={kind} value={kind}>
                            {FEATURE_KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      Rotation ({Math.round((selectedFeature.rotation * 180) / Math.PI)}°)
                      <input
                        type="range"
                        min={0}
                        max={359}
                        value={Math.round((selectedFeature.rotation * 180) / Math.PI)}
                        onChange={(e) =>
                          updateSelectedFeature({ rotation: (Number(e.target.value) * Math.PI) / 180 })
                        }
                      />
                    </label>
                    <label className="form-field">
                      Skalierung ({selectedFeature.scale.toFixed(2)})
                      <input
                        type="range"
                        min={0.5}
                        max={3}
                        step={0.05}
                        value={selectedFeature.scale}
                        onChange={(e) => updateSelectedFeature({ scale: Number(e.target.value) })}
                      />
                    </label>
                    <button onClick={deleteSelectedFeature}>Feature löschen</button>
                  </>
                )}
                <p className="hint">
                  {features?.features.length ?? 0} Feature(s)
                  {missingTypeCount > 0 && `, ${missingTypeCount} ohne Typname`}
                </p>
              </>
            )}

            {mode === 'mapinfo' && gameplay && (
              <div className="form-grid vertical">
                {GAMEPLAY_FIELD_LABELS.map(({ key, label, step, hint }) => (
                  <label key={key} className="form-field">
                    {label}
                    <input
                      type="number"
                      step={step ?? 1}
                      value={gameplay[key]}
                      onChange={(e) => updateGameplayField(key, Number(e.target.value))}
                    />
                    {hint && <span className="hint">{hint}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
