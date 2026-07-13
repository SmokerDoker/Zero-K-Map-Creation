import { useEffect, useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import type { ZkInstallation } from '@zk-map/zk-locator'

export interface TestInZkViewProps {
  project: MapProjectSummary
  onBack: () => void
}

interface RunState {
  status: 'idle' | 'running' | 'done' | 'error'
  copiedToPath?: string
  launched?: boolean
  warnings?: string[]
  error?: string
}

const SOURCE_LABELS: Record<ZkInstallation['source'], string> = {
  steam: 'Steam',
  standalone: 'Standalone',
  manual: 'Manuell gewählt'
}

export function TestInZkView({ project, onBack }: TestInZkViewProps): JSX.Element {
  const [installations, setInstallations] = useState<ZkInstallation[] | null>(null)
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [run, setRun] = useState<RunState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false
    window.api.detectZkInstallations().then((found) => {
      if (cancelled) return
      setInstallations(found)
      if (found.length > 0) setSelectedDir(found[0].installDir)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handlePickFolder(): Promise<void> {
    const picked = await window.api.pickZkInstallDir()
    if (!picked) return
    setInstallations((prev) => {
      const others = (prev ?? []).filter((i) => i.installDir !== picked.installDir)
      return [picked, ...others]
    })
    setSelectedDir(picked.installDir)
  }

  async function handleTest(): Promise<void> {
    const installation = installations?.find((i) => i.installDir === selectedDir)
    if (!installation) return
    setRun({ status: 'running' })
    try {
      const result = await window.api.testInZeroK(project.projectPath, installation)
      setRun({
        status: 'done',
        copiedToPath: result.copiedToPath,
        launched: result.launched,
        warnings: result.warnings
      })
    } catch (err) {
      setRun({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  const selected = installations?.find((i) => i.installDir === selectedDir) ?? null

  return (
    <div className="app">
      <header className="app-header">
        <h1>In Zero-K testen</h1>
        <p className="subtitle">{project.name} · kompiliert, kopiert die Karte und startet Zero-K</p>
      </header>
      <main className="mapinfo-form">
        {installations === null ? (
          <p className="loading">Suche nach Zero-K-Installationen…</p>
        ) : (
          <>
            {installations.length === 0 && (
              <p className="hint warning">
                Keine Zero-K-Installation automatisch gefunden (Steam oder Standalone). Bitte den
                Ordner manuell wählen.
              </p>
            )}

            <div className="zk-install-list">
              {installations.map((inst) => (
                <label key={inst.installDir} className="zk-install-row">
                  <input
                    type="radio"
                    name="zk-install"
                    checked={inst.installDir === selectedDir}
                    onChange={() => setSelectedDir(inst.installDir)}
                  />
                  <span className="zk-install-path">{inst.installDir}</span>
                  <span className="zk-install-source">{SOURCE_LABELS[inst.source]}</span>
                  {!inst.launcherPath && (
                    <span className="hint warning">Launcher nicht gefunden — manuell starten</span>
                  )}
                </label>
              ))}
            </div>

            <button onClick={handlePickFolder}>Anderen Ordner wählen…</button>

            {run.status === 'error' && <p className="error">{run.error}</p>}

            {run.status === 'done' && (
              <div className="compile-result">
                <p>✓ Karte kopiert nach:</p>
                <p className="project-path">{run.copiedToPath}</p>
                <p>{run.launched ? '✓ Zero-K wurde gestartet.' : '⚠ Zero-K konnte nicht automatisch gestartet werden — bitte manuell starten.'}</p>
                <p className="hint">
                  Im Spiel: "Only featured maps" in den Einstellungen deaktivieren, dann im
                  Skirmish-Menü die Karte manuell auswählen.
                </p>
                {run.warnings && run.warnings.length > 0 && (
                  <ul className="hint warning">
                    {run.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="dialog-actions">
              <button onClick={onBack}>← Zurück</button>
              <button onClick={handleTest} disabled={!selected || run.status === 'running'}>
                {run.status === 'running' ? 'Läuft…' : 'Kompilieren & Testen'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
