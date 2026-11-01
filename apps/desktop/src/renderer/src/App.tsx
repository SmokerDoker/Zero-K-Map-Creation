import { useState } from 'react'
import type { MapProjectSummary } from '@zk-map/shared-types'
import { NewProjectDialog } from './NewProjectDialog'
import { MapWorkspace } from './MapWorkspace'
import { CompileView } from './CompileView'
import { TestInZkView } from './TestInZkView'
import { PublishView } from './PublishView'
import { LanguageSelect } from './LanguageSelect'
import { useI18n } from './i18n'
import { formatError } from './errors'

type View = 'project' | 'workspace' | 'compile' | 'test' | 'publish'

function App(): JSX.Element {
  const { t } = useI18n()
  const [project, setProject] = useState<MapProjectSummary | null>(null)
  const [view, setView] = useState<View>('project')
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOpenProject(): Promise<void> {
    setError(null)
    try {
      const opened = await window.api.pickAndOpenProject()
      if (opened) setProject(opened)
    } catch (err) {
      setError(formatError(err))
    }
  }

  if (project && view === 'workspace') {
    return (
      <MapWorkspace project={project} onBack={() => setView('project')} onProjectUpdated={setProject} />
    )
  }

  if (project && view === 'compile') {
    return <CompileView project={project} onBack={() => setView('project')} />
  }

  if (project && view === 'test') {
    return <TestInZkView project={project} onBack={() => setView('project')} />
  }

  if (project && view === 'publish') {
    return <PublishView project={project} onBack={() => setView('project')} />
  }

  if (project) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-row">
            <h1>{project.name}</h1>
            <LanguageSelect />
          </div>
          <p className="subtitle">
            {t('project.byline', {
              author: project.author || t('project.unknownAuthor'),
              version: project.version,
              size: `${project.size.width}×${project.size.height}`
            })}
          </p>
        </header>
        <main>
          <p>{project.description || t('project.noDescription')}</p>
          <p className="project-path">{project.projectPath}</p>
          <div className="project-actions">
            <button onClick={() => setView('workspace')}>{t('project.edit')}</button>
            <button onClick={() => setView('compile')}>{t('project.compile')}</button>
            <button onClick={() => setView('test')}>{t('project.test')}</button>
            <button onClick={() => setView('publish')}>{t('project.publish')}</button>
          </div>
          <button
            className="secondary"
            onClick={() => {
              setProject(null)
              setView('project')
            }}
          >
            {t('project.backToDashboard')}
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <h1>Zero-K Map Creator</h1>
          <LanguageSelect />
        </div>
        <p className="subtitle">{t('dashboard.subtitle')}</p>
      </header>
      <main className="dashboard">
        <button onClick={() => setShowNewProjectDialog(true)}>{t('dashboard.newProject')}</button>
        <button onClick={handleOpenProject}>{t('dashboard.openProject')}</button>
        {error && <p className="error">{error}</p>}
      </main>
      {showNewProjectDialog && (
        <NewProjectDialog
          onClose={() => setShowNewProjectDialog(false)}
          onCreated={(created) => {
            setProject(created)
            setShowNewProjectDialog(false)
          }}
        />
      )}
    </div>
  )
}

export default App
