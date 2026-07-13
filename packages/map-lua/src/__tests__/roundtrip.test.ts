import { describe, expect, it } from 'vitest'
import { generateMapInfoLua, generateMetalLayoutLua, generateStartboxesLua } from '../generate'
import { parseMapInfoLua, parseMetalLayoutLua, parseStartboxesLua } from '../parse'
import type { MapInfo, MetalLayout, StartboxConfig } from '../types'

describe('mapinfo.lua', () => {
  const info: MapInfo = {
    name: 'Iron Valley',
    shortName: 'ironvalley',
    description: 'A "narrow" valley map with rivers.',
    author: 'SmokerDoker',
    version: '1.0',
    mapFile: 'maps/ironvalley.smf',
    gravity: 130,
    tidalStrength: 0,
    maxMetal: 0.02,
    extractorRadius: 500,
    minWind: 5,
    maxWind: 25,
    minHeight: -80,
    maxHeight: 420
  }

  it('round-trips through generate + parse', () => {
    const lua = generateMapInfoLua(info)
    expect(parseMapInfoLua(lua)).toEqual(info)
  })

  it('escapes quotes in strings so the generated Lua stays valid', () => {
    const lua = generateMapInfoLua(info)
    expect(lua).toContain('\\"narrow\\"')
    expect(() => parseMapInfoLua(lua)).not.toThrow()
  })

  it('parses a hand-written mapinfo.lua using the local/return pattern', () => {
    const handWritten = `
local mapinfo = {
  name = "Test Map",
  shortname = "testmap",
  description = "hand written",
  author = "Someone",
  version = "2.3",
  mapfile = "maps/test.smf",
  gravity = 140,
  tidalStrength = 12,
  maxMetal = 0.03,
  extractorRadius = 400,
  minWind = 0,
  maxWind = 10,
  smf = {
    minheight = -100,
    maxheight = 300,
  },
}

return mapinfo
`
    const parsed = parseMapInfoLua(handWritten)
    expect(parsed.name).toBe('Test Map')
    expect(parsed.gravity).toBe(140)
    expect(parsed.minHeight).toBe(-100)
    expect(parsed.maxHeight).toBe(300)
  })
})

describe('map_startboxes.lua', () => {
  const config: StartboxConfig = {
    teams: [
      {
        nameLong: 'West Team',
        nameShort: 'West',
        startpoints: [
          [100, 100],
          [100, 200]
        ],
        boxes: [
          [
            [0, 0],
            [300, 0],
            [300, 600],
            [0, 600]
          ]
        ]
      },
      {
        nameLong: 'East Team',
        nameShort: 'East',
        startpoints: [[900, 100]],
        boxes: [
          [
            [700, 0],
            [1000, 0],
            [1000, 600],
            [700, 600]
          ]
        ]
      }
    ],
    supportedPlayerCounts: [2]
  }

  it('round-trips through generate + parse', () => {
    const lua = generateStartboxesLua(config)
    expect(parseStartboxesLua(lua)).toEqual(config)
  })

  it('returns two values: team boxes and supported player counts', () => {
    const lua = generateStartboxesLua(config)
    expect(lua.trim().endsWith('return startboxes, playercounts')).toBe(true)
  })

  it('parses the wiki-documented Startbox API shape directly', () => {
    const wikiStyle = `
local main_config = {
  {
    boxes = {
      {
        {123, 456},
        {234, 567},
        {345, 678},
      },
    },
    startpoints = {
      {123, 456},
      {654, 321},
    },
    nameLong = "longer string with team name",
    nameShort = "short",
  },
}
local playercounts = {2, 3, 5, 7}

return main_config, playercounts
`
    const parsed = parseStartboxesLua(wikiStyle)
    expect(parsed.supportedPlayerCounts).toEqual([2, 3, 5, 7])
    expect(parsed.teams).toHaveLength(1)
    expect(parsed.teams[0].nameShort).toBe('short')
    expect(parsed.teams[0].boxes[0]).toEqual([
      [123, 456],
      [234, 567],
      [345, 678]
    ])
  })
})

describe('map_metal_layout.lua', () => {
  const layout: MetalLayout = {
    spots: [
      { x: 100, z: 200, metal: 2 },
      { x: 300, z: 450 } // no explicit yield — Zero-K computes it automatically
    ]
  }

  it('round-trips through generate + parse', () => {
    const lua = generateMetalLayoutLua(layout)
    expect(parseMetalLayoutLua(lua)).toEqual(layout)
  })

  it('omits the metal field when not specified, matching the optional-field contract', () => {
    const lua = generateMetalLayoutLua(layout)
    expect(lua).not.toMatch(/x = 300, z = 450, metal/)
  })
})
