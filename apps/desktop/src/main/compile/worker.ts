import { parentPort, workerData } from 'node:worker_threads'
import { isLanguage } from '../../shared/i18n'
import { setMainLanguage } from '../language'
import { runCompile } from './run'
import type { CompileWorkerData, CompileWorkerMessage } from './progress'

// Entry point of the compile worker thread. Texture generation and DXT1 compression are CPU-bound
// and take seconds to minutes on big maps, so they must never run on Electron's main thread.
const data = workerData as CompileWorkerData
if (isLanguage(data.language)) setMainLanguage(data.language)

function post(message: CompileWorkerMessage): void {
  parentPort?.postMessage(message)
}

runCompile(data.projectPath, (progress) => post({ type: 'progress', progress }))
  .then((result) => post({ type: 'result', result }))
  .catch((err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }))
