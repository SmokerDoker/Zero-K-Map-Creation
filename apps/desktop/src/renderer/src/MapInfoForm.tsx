import { useEffect, useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import type { GameplaySettings } from '../../main/mapconfig'

export interface MapInfoFormProps {
  project: MapProjectSummary
  onBack: () => void
}

const FIELD_LABELS: { key: keyof GameplaySettings; label: string; step?: number; hint?: string }[] = [
  { key: 'gravity', label: 'Gravitation', hint: 'Standard: 130' },
  { key: 'tidalStrength', label: 'Gezeitenstärke', hint: 'Energie pro Tidal-Generator, 0 = kein Wasser-Bonus' },
  { key: 'maxMetal', label: 'Max. Metall pro Fläche', step: 0.005, hint: 'Standard: 0.02' },
  { key: 'extractorRadius', label: 'Extraktor-Radius', hint: 'Standard: 500' },
  { key: 'minWind', label: 'Wind (min.)' },
  { key: 'maxWind', label: 'Wind (max.)' },
  { key: 'minHeight', label: 'Minimale Höhe', hint: 'Muss zur Heightmap passen' },
  { key: 'maxHeight', label: 'Maximale Höhe', hint: 'Muss zur Heightmap passen' }
]

export function MapInfoForm({ project, onBack }: MapInfoFormProps): JSX.Element {
  const [settings, setSettings] = useState<GameplaySettings | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    let cancelled = false
    window.api.loadGameplaySettings(project.projectPath).then((loaded) => {
      if (!cancelled) setSettings(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [project.projectPath])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaveState('saving')
    await window.api.saveGameplaySettings(project.projectPath, settings)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  function updateField(key: keyof GameplaySettings, value: number): void {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kartendaten</h1>
        <p className="subtitle">{project.name} · Gameplay-Einstellungen für mapinfo.lua</p>
      </header>
      <main className="mapinfo-form">
        {!settings ? (
          <p className="loading">Lade…</p>
        ) : (
          <>
            <div className="form-grid">
              {FIELD_LABELS.map(({ key, label, step, hint }) => (
                <label key={key} className="form-field">
                  {label}
                  <input
                    type="number"
                    step={step ?? 1}
                    value={settings[key]}
                    onChange={(e) => updateField(key, Number(e.target.value))}
                  />
                  {hint && <span className="hint">{hint}</span>}
                </label>
              ))}
            </div>
            <div className="dialog-actions">
              <button onClick={onBack}>← Zurück</button>
              <button onClick={handleSave} disabled={saveState === 'saving'}>
                {saveState === 'saving' ? 'Speichert…' : saveState === 'saved' ? 'Gespeichert ✓' : 'Speichern'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
