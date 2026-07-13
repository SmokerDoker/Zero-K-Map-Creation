import {
  generateMapInfoLua,
  generateMetalLayoutLua,
  generateStartboxesLua,
  type MapInfo,
  type MetalLayout,
  type StartboxConfig
} from '@zk-map/map-lua'
import type { MapProjectMetadata } from '@zk-map/shared-types'
import type { GameplaySettings } from '../mapconfig'

export interface BuildLuaInput {
  project: MapProjectMetadata
  gameplay: GameplaySettings
  startboxes: StartboxConfig
  metalLayout: MetalLayout
  mapFileBaseName: string
}

export interface BuildLuaOutput {
  mapInfoLua: string
  startboxesLua: string
  metalLayoutLua: string
}

export function buildLuaFiles(input: BuildLuaInput): BuildLuaOutput {
  const mapInfo: MapInfo = {
    name: input.project.name,
    shortName: input.project.name.replace(/\s+/g, '').slice(0, 24) || 'map',
    description: input.project.description,
    author: input.project.author,
    version: input.project.version,
    mapFile: `maps/${input.mapFileBaseName}.smf`,
    gravity: input.gameplay.gravity,
    tidalStrength: input.gameplay.tidalStrength,
    maxMetal: input.gameplay.maxMetal,
    extractorRadius: input.gameplay.extractorRadius,
    minWind: input.gameplay.minWind,
    maxWind: input.gameplay.maxWind,
    minHeight: input.gameplay.minHeight,
    maxHeight: input.gameplay.maxHeight
  }

  return {
    mapInfoLua: generateMapInfoLua(mapInfo),
    startboxesLua: generateStartboxesLua(input.startboxes),
    metalLayoutLua: generateMetalLayoutLua(input.metalLayout)
  }
}
