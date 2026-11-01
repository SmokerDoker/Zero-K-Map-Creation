import { useEffect, useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import type { ZkInstallation } from '@zk-map/zk-locator'
import { useI18n } from './i18n'
import { formatError } from './errors'
import { CompileProgressBar, useCompileProgress } from './CompileProgressBar'

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

export function TestInZkView({ project, onBack }: TestInZkViewProps): JSX.Element {
  const { t } = useI18n()
  const [installations, setInstallations] = useState<ZkInstallation[] | null>(null)
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [run, setRun] = useState<RunState>({ status: 'idle' })
  const progress = useCompileProgress(run.status === 'running')

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
      setRun({ status: 'error', error: formatError(err) })
    }
  }

  const selected = installations?.find((i) => i.installDir === selectedDir) ?? null

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('test.title')}</h1>
        <p className="subtitle">{t('test.subtitle', { name: project.name })}</p>
      </header>
      <main className="mapinfo-form">
        {installations === null ? (
          <p className="loading">{t('test.searching')}</p>
        ) : (
          <>
            {installations.length === 0 && (
              <p className="hint warning">
                {t('test.noneFound')}
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
                  <span className="zk-install-source">{t(`test.source.${inst.source}`)}</span>
                  {!inst.launcherPath && (
                    <span className="hint warning">{t('test.noLauncher')}</span>
                  )}
                </label>
              ))}
            </div>

            <button className="secondary" onClick={handlePickFolder}>{t('test.pickFolder')}</button>

            {run.status === 'running' && <CompileProgressBar progress={progress} />}

            {run.status === 'error' && <p className="error">{run.error}</p>}

            {run.status === 'done' && (
              <div className="compile-result">
                <p>{t('test.copiedTo')}</p>
                <p className="project-path">{run.copiedToPath}</p>
                <p>{run.launched ? t('test.launched') : t('test.notLaunched')}</p>
                <p className="hint">
                  {t('test.inGameHint')}
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
              <button className="secondary" onClick={onBack} disabled={run.status === 'running'}>
                {t('common.back')}
              </button>
              <button onClick={handleTest} disabled={!selected || run.status === 'running'}>
                {run.status === 'running' ? t('test.running') : t('test.start')}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
