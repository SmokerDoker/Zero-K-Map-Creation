import { useEffect, useState } from 'react'
import type { CompileProgress } from '../../main/compile/progress'
import { useI18n } from './i18n'

/** Live progress of the compile currently running in the main process's worker thread. */
export function useCompileProgress(active: boolean): CompileProgress | null {
  const [progress, setProgress] = useState<CompileProgress | null>(null)
  useEffect(() => {
    if (!active) {
      setProgress(null)
      return
    }
    return window.api.onCompileProgress(setProgress)
  }, [active])
  return progress
}

export function CompileProgressBar({
  progress,
  onCancel
}: {
  progress: CompileProgress | null
  onCancel?: () => void
}): JSX.Element {
  const { t } = useI18n()
  const percent = Math.round((progress?.overall ?? 0) * 100)
  return (
    <div className="compile-progress">
      <div className="compile-progress-label">
        <span>{t(`compile.stage.${progress?.stage ?? 'loading'}`)}</span>
        <span>{percent}%</span>
      </div>
      <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {onCancel && (
        <button type="button" className="secondary" onClick={onCancel}>
          {t('compile.cancel')}
        </button>
      )}
    </div>
  )
}
