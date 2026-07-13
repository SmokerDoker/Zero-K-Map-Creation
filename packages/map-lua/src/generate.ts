import { luaNumber, luaPointArray, luaString } from './lua-format'
import type { MapInfo, MetalLayout, StartboxConfig, StartboxTeam } from './types'

export function generateMapInfoLua(info: MapInfo): string {
  return `local mapinfo = {
  name        = ${luaString(info.name)},
  shortname   = ${luaString(info.shortName)},
  description = ${luaString(info.description)},
  author      = ${luaString(info.author)},
  version     = ${luaString(info.version)},
  mapfile     = ${luaString(info.mapFile)},

  gravity        = ${luaNumber(info.gravity)},
  tidalStrength  = ${luaNumber(info.tidalStrength)},
  maxMetal       = ${luaNumber(info.maxMetal)},
  extractorRadius = ${luaNumber(info.extractorRadius)},

  minWind = ${luaNumber(info.minWind)},
  maxWind = ${luaNumber(info.maxWind)},

  smf = {
    minheight = ${luaNumber(info.minHeight)},
    maxheight = ${luaNumber(info.maxHeight)},
  },
}

return mapinfo
`
}

function generateStartboxTeam(team: StartboxTeam, level: number): string {
  const boxesLines = team.boxes
    .map((box) => `${'  '.repeat(level + 2)}${luaPointArray(box, level + 2)},`)
    .join('\n')

  return `${'  '.repeat(level)}{
${'  '.repeat(level + 1)}nameLong = ${luaString(team.nameLong)},
${'  '.repeat(level + 1)}nameShort = ${luaString(team.nameShort)},
${'  '.repeat(level + 1)}startpoints = ${luaPointArray(team.startpoints, level + 1)},
${'  '.repeat(level + 1)}boxes = {
${boxesLines}
${'  '.repeat(level + 1)}},
${'  '.repeat(level)}},`
}

export function generateStartboxesLua(config: StartboxConfig): string {
  const teamsLua = config.teams.map((team) => generateStartboxTeam(team, 1)).join('\n')
  const counts = config.supportedPlayerCounts.map(luaNumber).join(', ')

  return `local startboxes = {
${teamsLua}
}

local playercounts = {${counts}}

return startboxes, playercounts
`
}

export function generateMetalLayoutLua(layout: MetalLayout): string {
  const spotsLua = layout.spots
    .map((spot) => {
      const metalField = spot.metal !== undefined ? `, metal = ${luaNumber(spot.metal)}` : ''
      return `    { x = ${luaNumber(spot.x)}, z = ${luaNumber(spot.z)}${metalField} },`
    })
    .join('\n')

  return `local mapConfig = {
  spots = {
${spotsLua}
  },
}

return mapConfig
`
}
