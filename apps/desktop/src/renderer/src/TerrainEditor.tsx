import { useEffect, useRef, useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import { heightmapResolution } from '@zk-map/shared-types'
import { HeightmapCanvas, type BrushMode } from './HeightmapCanvas'
import { TerrainPreview3D } from './TerrainPreview3D'

export interface TerrainEditorProps {
  project: MapProjectSummary
  onBack: () => void
}

const BRUSH_MODES: { mode: BrushMode; label: string }[] = [
  { mode: 'raise', label: 'Anheben' },
  { mode: 'lower', label: 'Absenken' },
  { mode: 'smooth', label: 'Glätten' },
  { mode: 'flatten', label: 'Ebnen' }
]

export function TerrainEditor({ project, onBack }: TerrainEditorProps): JSX.Element {
  const width = heightmapResolution(project.size.width)
  const height = heightmapResolution(project.size.height)

  const heightsRef = useRef<Float32Array>(new Float32Array(width * height).fill(0.5))
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)
  const [brushMode, setBrushMode] = useState<BrushMode>('raise')
  const [brushRadius, setBrushRadius] = useState(24)
  const [brushStrength, setBrushStrength] = useState(0.04)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    let cancelled = false
    window.api.loadTerrain(project.projectPath, width, height).then((data) => {
      if (cancelled) return
      heightsRef.current = data
      setLoaded(true)
      setVersion((v) => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [project.projectPath, width, height])

  async function handleSave(): Promise<void> {
    setSaveState('saving')
    await window.api.saveTerrain(project.projectPath, heightsRef.current)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  return (
    <div className="terrain-editor">
      <div className="terrain-toolbar">
        <button onClick={onBack}>← Zurück</button>
        <div className="brush-modes">
          {BRUSH_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              className={mode === brushMode ? 'active' : ''}
              onClick={() => setBrushMode(mode)}
            >
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
        <button onClick={handleSave} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Speichert…' : saveState === 'saved' ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>

      {!loaded ? (
        <p className="loading">Lade Terrain…</p>
      ) : (
        <div className="terrain-panes">
          <div className="terrain-pane">
            <HeightmapCanvas
              heightsRef={heightsRef}
              width={width}
              height={height}
              brushMode={brushMode}
              brushRadius={brushRadius}
              brushStrength={brushStrength}
              onChange={() => setVersion((v) => v + 1)}
            />
          </div>
          <div className="terrain-pane">
            <TerrainPreview3D heightsRef={heightsRef} width={width} height={height} version={version} />
          </div>
        </div>
      )}
    </div>
  )
}
