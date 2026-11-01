import { useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import { useI18n } from './i18n'
import { formatError } from './errors'
import { CompileProgressBar, useCompileProgress } from './CompileProgressBar'

export interface CompileViewProps {
  project: MapProjectSummary
  onBack: () => void
}

interface CompileState {
  status: 'idle' | 'compiling' | 'done' | 'error' | 'cancelled'
  sddPath?: string
  sd7Path?: string
  warnings?: string[]
  durationMs?: number
  error?: string
}

export function CompileView({ project, onBack }: CompileViewProps): JSX.Element {
  const { t } = useI18n()
  const [state, setState] = useState<CompileState>({ status: 'idle' })
  const progress = useCompileProgress(state.status === 'compiling')

  async function handleCompile(): Promise<void> {
    setState({ status: 'compiling' })
    try {
      const result = await window.api.compileProject(project.projectPath)
      setState({ status: 'done', ...result })
    } catch (err) {
      setState((prev) =>
        prev.status === 'cancelled' ? prev : { status: 'error', error: formatError(err) }
      )
    }
  }

  async function handleCancel(): Promise<void> {
    setState({ status: 'cancelled' })
    await window.api.cancelCompile(project.projectPath)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('compile.title')}</h1>
        <p className="subtitle">{t('compile.subtitle', { name: project.name, version: project.version })}</p>
      </header>
      <main className="mapinfo-form">
        <p className="hint">{t('compile.intro')}</p>

        {state.status === 'compiling' && <CompileProgressBar progress={progress} onCancel={handleCancel} />}
        {state.status === 'cancelled' && <p className="hint warning">{t('compile.cancelled')}</p>}
        {state.status === 'error' && <p className="error">{state.error}</p>}

        {state.status === 'done' && (
          <div className="compile-result">
            <p>{t('compile.done', { seconds: ((state.durationMs ?? 0) / 1000).toFixed(1) })}</p>
            <p className="project-path">{state.sd7Path}</p>
            {state.warnings && state.warnings.length > 0 && (
              <ul className="hint warning">
                {state.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <button onClick={() => window.api.showInFolder(state.sd7Path as string)}>
              {t('common.showInFolder')}
            </button>
          </div>
        )}

        <div className="dialog-actions">
          <button className="secondary" onClick={onBack} disabled={state.status === 'compiling'}>
            {t('common.back')}
          </button>
          <button onClick={handleCompile} disabled={state.status === 'compiling'}>
            {state.status === 'compiling' ? t('compile.running') : t('compile.start')}
          </button>
        </div>
      </main>
    </div>
  )
}
