/**
 * Data model for Zero-K's Lua map config files: mapinfo.lua, mapconfig/map_startboxes.lua and
 * mapconfig/map_metal_layout.lua. Field names/shapes are taken from the Zero-K wiki's Startbox API
 * page, the ZeroK-RTS/Zero-K gadgets that read these files (mex_spot_finder.lua, start_boxes.lua)
 * and the widget that writes them (dbg_startbox_editor.lua), plus a real mapinfo.lua sample.
 */

export interface MapInfo {
  name: string
  shortName: string
  description: string
  author: string
  /** Map version string shown in Zero-K's map list, e.g. "1.0". */
  version: string
  /** Path to the compiled SMF, relative to the map archive root, e.g. "maps/mymap.smf". */
  mapFile: string
  gravity: number
  tidalStrength: number
  maxMetal: number
  extractorRadius: number
  minWind: number
  maxWind: number
  /** Must match the SMF header's minHeight/maxHeight. */
  minHeight: number
  maxHeight: number
}

/** [x, z] world-coordinate pair. */
export type Point2D = [number, number]

export interface StartboxTeam {
  nameLong: string
  nameShort: string
  /** Recommended spawn points inside the box; at least one is required. */
  startpoints: Point2D[]
  /** One or more polygons (vertices wound clockwise); usually just one simple box. */
  boxes: Point2D[][]
}

export interface StartboxConfig {
  teams: StartboxTeam[]
  /** Team counts this layout supports, e.g. [2] for a straight 1v1 box pair. */
  supportedPlayerCounts: number[]
}

export interface MetalSpot {
  x: number
  z: number
  /** Metal yield; omitted lets Zero-K compute a default automatically. */
  metal?: number
}

export interface MetalLayout {
  spots: MetalSpot[]
}
