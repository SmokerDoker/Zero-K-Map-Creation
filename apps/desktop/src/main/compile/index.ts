import type { Worker } from 'node:worker_threads'
import createCompileWorker from './worker?nodeWorker'
import { getMainLanguage, t } from '../language'
import type { CompileProgress, CompileResult, CompileWorkerData, CompileWorkerMessage } from './progress'

export type { CompileProgress, CompileResult, CompileStage } from './progress'
export { archiveBaseName } from './run'

/** Compiles started from the UI, keyed by project path, so they can be cancelled. */
const activeWorkers = new Map<string, Worker>()
const cancelledWorkers = new WeakSet<Worker>()

export class CompileCancelledError extends Error {}

/** Compiles a project in a separate worker thread so the UI stays responsive, reporting progress
 * along the way. Rejects with CompileCancelledError if cancelCompile() is called meanwhile. */
export function compileProject(
  projectPath: string,
  onProgress: (progress: CompileProgress) => void = () => {}
): Promise<CompileResult> {
  if (activeWorkers.has(projectPath)) {
    return Promise.reject(new Error(t('compile.error.alreadyRunning')))
  }

  const workerData: CompileWorkerData = { projectPath, language: getMainLanguage() }
  const worker = createCompileWorker({ workerData })
  activeWorkers.set(projectPath, worker)

  return new Promise<CompileResult>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      activeWorkers.delete(projectPath)
      fn()
    }

    worker.on('message', (message: CompileWorkerMessage) => {
      if (message.type === 'progress') onProgress(message.progress)
      else if (message.type === 'result') {
        finish(() => resolve(message.result))
        void worker.terminate()
      } else if (message.type === 'error') {
        finish(() => reject(new Error(message.message)))
        void worker.terminate()
      }
    })
    worker.on('error', (err) => finish(() => reject(err)))
    worker.on('exit', (code) => {
      // Only reached if the worker stopped without posting a result (cancelled or crashed).
      finish(() =>
        reject(
          cancelledWorkers.has(worker)
            ? new CompileCancelledError(t('compile.cancelled'))
            : new Error(t('compile.error.workerExited', { code }))
        )
      )
    })
  })
}

/** Stops a running compile for the given project. Returns false if none was running. */
export function cancelCompile(projectPath: string): boolean {
  const worker = activeWorkers.get(projectPath)
  if (!worker) return false
  cancelledWorkers.add(worker)
  void worker.terminate()
  return true
}
