import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { encodeSmf, encodeSmt } from '@zk-map/smf-format'
import { heightmapResolution } from '@zk-map/shared-types'
import { openProject } from '../project'
import { loadTerrain } from '../terrain'
import { loadGameplaySettings, loadMetalLayout, loadStartboxes, loadFeatures } from '../mapconfig'
import { buildSmf } from './build-smf'
import { buildLuaFiles } from './build-lua'
import { packageSdd } from './package'
import { t } from '../language'
import { overallProgress, type CompileProgress, type CompileResult, type CompileStage } from './progress'

function sanitizeFileName(name: string): string {
  const safe = name.trim().replace(/[\\/:*?"<>|]+/g, '_')
  return safe || 'map'
}

/** Archive file name, e.g. "My_Map_1.2". Including the version keeps every published release
 * distinct (springfiles and Zero-K both treat name+version as the archive's identity). */
export function archiveBaseName(name: string, version: string): string {
  const base = sanitizeFileName(name).replace(/\s+/g, '_')
  const ver = sanitizeFileName(version).replace(/\s+/g, '_')
  return ver ? `${base}_${ver}` : base
}

/** Runs the whole compile synchronously in the calling thread. Only call this from the compile
 * worker (see worker.ts) — on the main thread it would freeze the UI for large maps. */
export async function runCompile(
  projectPath: string,
  onProgress: (progress: CompileProgress) => void = () => {}
): Promise<CompileResult> {
  const startedAt = Date.now()
  let lastReported = -1
  let lastStage: CompileStage | null = null
  const report = (stage: CompileStage, fraction: number): void => {
    const overall = overallProgress(stage, fraction)
    // Throttle: post on stage changes and every ~0.5% of overall progress.
    if (stage === lastStage && overall - lastReported < 0.005) return
    lastStage = stage
    lastReported = overall
    onProgress({ stage, overall })
  }
  report('loading', 0)
  const warnings: string[] = []

  const project = await openProject(projectPath)
  const { size } = project

  const mapWidthSquares = size.width * 64
  const mapHeightSquares = size.height * 64
  if (mapWidthSquares % 128 !== 0 || mapHeightSquares % 128 !== 0) {
    throw new Error(t('compile.error.invalidSize', { width: size.width, height: size.height }))
  }

  const heightmapWidth = heightmapResolution(size.width)
  const heightmapHeight = heightmapResolution(size.height)

  const [heights, gameplay, startboxes, metalLayout, features] = await Promise.all([
    loadTerrain(projectPath, heightmapWidth, heightmapHeight),
    loadGameplaySettings(projectPath),
    loadStartboxes(projectPath, mapWidthSquares * 8, mapHeightSquares * 8),
    loadMetalLayout(projectPath),
    loadFeatures(projectPath)
  ])

  const safeName = sanitizeFileName(project.name)
  const archiveName = archiveBaseName(project.name, project.version)

  const { smf, smt, skippedFeatureCount } = buildSmf({
    project,
    gameplay,
    heights,
    heightmapWidth,
    heightmapHeight,
    features,
    tileFileName: `${safeName}.smt`,
    onProgress: report
  })
  if (skippedFeatureCount > 0) {
    warnings.push(t('compile.warning.skippedFeatures', { count: skippedFeatureCount }))
  }

  const { mapInfoLua, startboxesLua, metalLayoutLua } = buildLuaFiles({
    project,
    gameplay,
    startboxes,
    metalLayout,
    mapFileBaseName: safeName
  })

  const generatedDir = join(projectPath, 'generated')
  const sddPath = join(generatedDir, `${archiveName}.sdd`)
  const sd7Path = join(generatedDir, `${archiveName}.sd7`)

  report('encoding', 0)
  const smfBytes = encodeSmf(smf)
  const smtBytes = encodeSmt(smt)
  report('encoding', 1)

  await rm(sddPath, { recursive: true, force: true })
  await rm(sd7Path, { force: true })
  await mkdir(join(sddPath, 'maps'), { recursive: true })
  await mkdir(join(sddPath, 'mapconfig'), { recursive: true })

  report('writing', 0)
  await Promise.all([
    writeFile(join(sddPath, 'mapinfo.lua'), mapInfoLua, 'utf-8'),
    writeFile(join(sddPath, 'maps', `${safeName}.smf`), smfBytes),
    writeFile(join(sddPath, 'maps', `${safeName}.smt`), smtBytes),
    writeFile(join(sddPath, 'mapconfig', 'map_startboxes.lua'), startboxesLua, 'utf-8'),
    writeFile(join(sddPath, 'mapconfig', 'map_metal_layout.lua'), metalLayoutLua, 'utf-8')
  ])

  report('packaging', 0)
  await packageSdd(sddPath, sd7Path, (f) => report('packaging', f))
  report('done', 1)

  return { sddPath, sd7Path, warnings, durationMs: Date.now() - startedAt }
}
