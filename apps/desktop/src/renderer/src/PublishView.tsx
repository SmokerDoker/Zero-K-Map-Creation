import { useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import { useI18n } from './i18n'
import { formatError } from './errors'
import { CompileProgressBar, useCompileProgress } from './CompileProgressBar'

export interface PublishViewProps {
  project: MapProjectSummary
  onBack: () => void
}

const SPRINGFILES_UPLOAD_URL = 'https://springfiles.springrts.com/upload/'
const ZK_MAPS_URL = 'https://zero-k.info/Maps'

interface CompileState {
  status: 'idle' | 'compiling' | 'done' | 'error'
  sd7Path?: string
  error?: string
}

export function PublishView({ project, onBack }: PublishViewProps): JSX.Element {
  const { t } = useI18n()
  const [state, setState] = useState<CompileState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)
  const progress = useCompileProgress(state.status === 'compiling')
  // Kept in English on purpose: it is pasted into the (English) springfiles upload form.
  const metadataText = `Name: ${project.name}\nAuthor: ${project.author}\nVersion: ${project.version}\nDescription: ${project.description}`

  async function handleCompile(): Promise<void> {
    setState({ status: 'compiling' })
    try {
      const result = await window.api.compileProject(project.projectPath)
      setState({ status: 'done', sd7Path: result.sd7Path })
    } catch (err) {
      setState({ status: 'error', error: formatError(err) })
    }
  }

  async function handleCopyMetadata(): Promise<void> {
    await navigator.clipboard.writeText(metadataText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('publish.title')}</h1>
        <p className="subtitle">{t('publish.subtitle', { name: project.name, version: project.version })}</p>
      </header>
      <main className="mapinfo-form">
        <p className="hint">
          {t('publish.intro')}
        </p>
        <p className="hint">
          {t('publish.versionHint', { version: project.version })}
        </p>

        {state.status === 'error' && <p className="error">{state.error}</p>}

        {state.status === 'compiling' && <CompileProgressBar progress={progress} />}

        {state.status !== 'done' && (
          <button onClick={handleCompile} disabled={state.status === 'compiling'}>
            {state.status === 'compiling' ? t('compile.running') : t('publish.step.compile')}
          </button>
        )}

        {state.status === 'done' && (
          <div className="compile-result">
            <p>{t('publish.ready')}</p>
            <p className="project-path">{state.sd7Path}</p>

            <div className="project-actions">
              <button onClick={() => window.api.showInFolder(state.sd7Path as string)}>
                {t('publish.step.openFolder')}
              </button>
              <button onClick={() => window.api.openExternal(SPRINGFILES_UPLOAD_URL)}>
                {t('publish.step.springfiles')}
              </button>
              <button onClick={() => window.api.openExternal(ZK_MAPS_URL)}>
                {t('publish.step.zkMaps')}
              </button>
            </div>

            <label className="form-field">
              {t('publish.metadata')}
              <textarea
                readOnly
                rows={4}
                value={metadataText}
              />
            </label>
            <button onClick={handleCopyMetadata}>
              {copied ? t('publish.copied') : t('publish.copy')}
            </button>

            <p className="hint">
              {t('publish.afterUpload')}
            </p>
          </div>
        )}

        <div className="dialog-actions">
          <button className="secondary" onClick={onBack}>
            {t('common.back')}
          </button>
        </div>
      </main>
    </div>
  )
}
