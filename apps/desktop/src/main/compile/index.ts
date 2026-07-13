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

export interface CompileResult {
  sddPath: string
  sd7Path: string
  warnings: string[]
  durationMs: number
}

function sanitizeFileName(name: string): string {
  const safe = name.trim().replace(/[\\/:*?"<>|]+/g, '_')
  return safe || 'map'
}

export async function compileProject(projectPath: string): Promise<CompileResult> {
  const startedAt = Date.now()
  const warnings: string[] = []

  const project = await openProject(projectPath)
  const { size } = project

  const mapWidthSquares = size.width * 64
  const mapHeightSquares = size.height * 64
  if (mapWidthSquares % 128 !== 0 || mapHeightSquares % 128 !== 0) {
    throw new Error(
      `Ungültige Kartengröße ${size.width}x${size.height}: Breite und Höhe müssen gerade Zahlen sein ` +
        `(Spring verlangt, dass die Kartenbreite/-höhe in Squares durch 128 teilbar ist).`
    )
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

  const { smf, smt, skippedFeatureCount } = buildSmf({
    project,
    gameplay,
    heights,
    heightmapWidth,
    heightmapHeight,
    features,
    tileFileName: `${safeName}.smt`
  })
  if (skippedFeatureCount > 0) {
    warnings.push(
      `${skippedFeatureCount} Feature(s) ohne Typname wurden beim Kompilieren übersprungen.`
    )
  }

  const { mapInfoLua, startboxesLua, metalLayoutLua } = buildLuaFiles({
    project,
    gameplay,
    startboxes,
    metalLayout,
    mapFileBaseName: safeName
  })

  const generatedDir = join(projectPath, 'generated')
  const sddPath = join(generatedDir, `${safeName}.sdd`)
  const sd7Path = join(generatedDir, `${safeName}.sd7`)

  await rm(sddPath, { recursive: true, force: true })
  await rm(sd7Path, { force: true })
  await mkdir(join(sddPath, 'maps'), { recursive: true })
  await mkdir(join(sddPath, 'mapconfig'), { recursive: true })

  await Promise.all([
    writeFile(join(sddPath, 'mapinfo.lua'), mapInfoLua, 'utf-8'),
    writeFile(join(sddPath, 'maps', `${safeName}.smf`), encodeSmf(smf)),
    writeFile(join(sddPath, 'maps', `${safeName}.smt`), encodeSmt(smt)),
    writeFile(join(sddPath, 'mapconfig', 'map_startboxes.lua'), startboxesLua, 'utf-8'),
    writeFile(join(sddPath, 'mapconfig', 'map_metal_layout.lua'), metalLayoutLua, 'utf-8')
  ])

  await packageSdd(sddPath, sd7Path)

  return { sddPath, sd7Path, warnings, durationMs: Date.now() - startedAt }
}
