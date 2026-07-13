import { useEffect, useRef, useState } from 'react'
import type { FeatureKind, FeatureLayout, MapFeatureInstance, MapProjectSummary } from '@zk-map/shared-types'
import { mapWorldSize } from '@zk-map/shared-types'

export interface FeatureEditorProps {
  project: MapProjectSummary
  onBack: () => void
}

const DISPLAY_SIZE = 640

const KIND_INFO: Record<FeatureKind, { label: string; color: string }> = {
  tree: { label: 'Baum', color: '#5ea25e' },
  rock: { label: 'Stein', color: '#9aa3b0' },
  geovent: { label: 'Geysir', color: '#e08a3c' },
  custom: { label: 'Sonstiges', color: '#a56ee0' }
}

function createId(): string {
  return crypto.randomUUID()
}

/** SVG path for a small kind-specific marker shape, centered on the origin. */
function markerPath(kind: FeatureKind): string {
  switch (kind) {
    case 'tree':
      return 'M 0,-10 L 9,8 L -9,8 Z' // triangle
    case 'rock':
      return 'M -9,0 A 9,9 0 1,0 9,0 A 9,9 0 1,0 -9,0 Z' // circle
    case 'geovent':
      return 'M 0,-10 L 10,0 L 0,10 L -10,0 Z' // diamond
    case 'custom':
      return 'M -8,-8 L 8,-8 L 8,8 L -8,8 Z' // square
  }
}

export function FeatureEditor({ project, onBack }: FeatureEditorProps): JSX.Element {
  const worldWidth = mapWorldSize(project.size.width)
  const worldHeight = mapWorldSize(project.size.height)

  const [layout, setLayout] = useState<FeatureLayout | null>(null)
  const [activeKind, setActiveKind] = useState<FeatureKind>('tree')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const draggingRef = useRef<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let cancelled = false
    window.api.loadFeatures(project.projectPath).then((loaded) => {
      if (!cancelled) setLayout(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [project.projectPath])

  async function handleSave(): Promise<void> {
    if (!layout) return
    setSaveState('saving')
    await window.api.saveFeatures(project.projectPath, layout)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  function worldToScreen(x: number, z: number): [number, number] {
    return [(x / worldWidth) * DISPLAY_SIZE, (z / worldHeight) * DISPLAY_SIZE]
  }

  function screenToWorld(sx: number, sy: number): [number, number] {
    return [
      Math.max(0, Math.min(worldWidth, (sx / DISPLAY_SIZE) * worldWidth)),
      Math.max(0, Math.min(worldHeight, (sy / DISPLAY_SIZE) * worldHeight))
    ]
  }

  function handleBackgroundClick(e: React.MouseEvent<SVGSVGElement>): void {
    if (!svgRef.current || !layout) return
    const rect = svgRef.current.getBoundingClientRect()
    const [x, z] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    const feature: MapFeatureInstance = {
      id: createId(),
      typeName: '',
      kind: activeKind,
      x,
      z,
      rotation: 0,
      scale: 1
    }
    setLayout({ features: [...layout.features, feature] })
    setSelectedId(feature.id)
  }

  function handleMarkerDown(id: string) {
    return (e: React.PointerEvent<SVGGElement>): void => {
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      draggingRef.current = id
      setSelectedId(id)
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    const id = draggingRef.current
    if (!id || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const [x, z] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    setLayout((prev) => {
      if (!prev) return prev
      return {
        features: prev.features.map((f) => (f.id === id ? { ...f, x, z } : f))
      }
    })
  }

  function handlePointerUp(): void {
    draggingRef.current = null
  }

  function updateSelected(patch: Partial<MapFeatureInstance>): void {
    if (!selectedId) return
    setLayout((prev) => {
      if (!prev) return prev
      return {
        features: prev.features.map((f) => (f.id === selectedId ? { ...f, ...patch } : f))
      }
    })
  }

  function deleteSelected(): void {
    if (!selectedId) return
    setLayout((prev) => {
      if (!prev) return prev
      return { features: prev.features.filter((f) => f.id !== selectedId) }
    })
    setSelectedId(null)
  }

  const selected = layout?.features.find((f) => f.id === selectedId) ?? null
  const missingTypeCount = layout?.features.filter((f) => !f.typeName.trim()).length ?? 0

  return (
    <div className="terrain-editor">
      <div className="terrain-toolbar">
        <button onClick={onBack}>← Zurück</button>
        <div className="brush-modes">
          {(Object.keys(KIND_INFO) as FeatureKind[]).map((kind) => (
            <button
              key={kind}
              className={kind === activeKind ? 'active' : ''}
              onClick={() => setActiveKind(kind)}
            >
              {KIND_INFO[kind].label}
            </button>
          ))}
        </div>
        <p className="toolbar-hint">Klick = platzieren · Ziehen = verschieben</p>
        <button onClick={handleSave} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Speichert…' : saveState === 'saved' ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>

      {!layout ? (
        <p className="loading">Lade…</p>
      ) : (
        <div className="startbox-pane">
          <svg
            ref={svgRef}
            width={DISPLAY_SIZE}
            height={DISPLAY_SIZE}
            className="startbox-svg"
            onClick={handleBackgroundClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <rect x={0} y={0} width={DISPLAY_SIZE} height={DISPLAY_SIZE} className="map-bounds" />
            {layout.features.map((f) => {
              const [x, y] = worldToScreen(f.x, f.z)
              const degrees = (f.rotation * 180) / Math.PI
              const isSelected = f.id === selectedId
              const missing = !f.typeName.trim()
              return (
                <g
                  key={f.id}
                  transform={`translate(${x}, ${y}) rotate(${degrees}) scale(${f.scale})`}
                  onPointerDown={handleMarkerDown(f.id)}
                  className={`feature-marker${isSelected ? ' selected' : ''}${missing ? ' missing-type' : ''}`}
                >
                  <path d={markerPath(f.kind)} fill={KIND_INFO[f.kind].color} />
                </g>
              )
            })}
          </svg>

          <div className="metal-side-panel">
            {!selected ? (
              <p className="hint">Kein Feature ausgewählt.</p>
            ) : (
              <>
                <label className="form-field">
                  Typname
                  <input
                    value={selected.typeName}
                    placeholder="z.B. TreeType0 (FeatureDef deiner Karte)"
                    onChange={(e) => updateSelected({ typeName: e.target.value })}
                  />
                  {!selected.typeName.trim() && (
                    <span className="hint warning">
                      Muss exakt zu einem FeatureDef deiner Karte passen (z.B. importiert via
                      Springboard), sonst erscheint das Objekt nicht im Spiel.
                    </span>
                  )}
                </label>
                <label className="form-field">
                  Art
                  <select
                    value={selected.kind}
                    onChange={(e) => updateSelected({ kind: e.target.value as FeatureKind })}
                  >
                    {(Object.keys(KIND_INFO) as FeatureKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_INFO[kind].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Rotation ({Math.round((selected.rotation * 180) / Math.PI)}°)
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={Math.round((selected.rotation * 180) / Math.PI)}
                    onChange={(e) => updateSelected({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
                  />
                </label>
                <label className="form-field">
                  Skalierung ({selected.scale.toFixed(2)})
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.05}
                    value={selected.scale}
                    onChange={(e) => updateSelected({ scale: Number(e.target.value) })}
                  />
                </label>
                <button onClick={deleteSelected}>Feature löschen</button>
              </>
            )}
            <p className="hint">
              {layout.features.length} Feature(s) insgesamt
              {missingTypeCount > 0 && `, ${missingTypeCount} ohne Typname`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
