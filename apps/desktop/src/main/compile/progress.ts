/** Stages of a map compile, in execution order. Labels are translated in the renderer. */
export type CompileStage =
  | 'loading'
  | 'texture'
  | 'tiles'
  | 'minimap'
  | 'encoding'
  | 'writing'
  | 'packaging'
  | 'done'

export interface CompileProgress {
  stage: CompileStage
  /** 0..1 across the whole compile. */
  overall: number
}

export interface CompileResult {
  sddPath: string
  sd7Path: string
  warnings: string[]
  durationMs: number
}

/** Rough share of total compile time per stage, measured on an 8x8 map. */
const STAGE_WEIGHTS: Record<CompileStage, number> = {
  loading: 0.02,
  texture: 0.33,
  tiles: 0.4,
  minimap: 0.05,
  encoding: 0.05,
  writing: 0.03,
  packaging: 0.12,
  done: 0
}

const STAGE_ORDER: CompileStage[] = [
  'loading',
  'texture',
  'tiles',
  'minimap',
  'encoding',
  'writing',
  'packaging',
  'done'
]

/** Maps progress within one stage to overall 0..1 progress. */
export function overallProgress(stage: CompileStage, stageFraction: number): number {
  let before = 0
  for (const s of STAGE_ORDER) {
    if (s === stage) break
    before += STAGE_WEIGHTS[s]
  }
  const clamped = Math.max(0, Math.min(1, stageFraction))
  return Math.min(1, before + STAGE_WEIGHTS[stage] * clamped)
}

/** Messages a compile worker posts to the main process. */
export type CompileWorkerMessage =
  | { type: 'progress'; progress: CompileProgress }
  | { type: 'result'; result: CompileResult }
  | { type: 'error'; message: string }

export interface CompileWorkerData {
  projectPath: string
  language: string
}
