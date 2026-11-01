import { describe, expect, it } from 'vitest'
import type { StartboxConfig } from '@zk-map/map-lua'
import {
  mirrorHeights,
  mirrorMetalSpots,
  mirrorPartner,
  mirrorStartboxes,
  sourceSidesFor,
  transformPoint,
  transformRotation,
  type SymmetryMode
} from '../symmetry'

const W = 4096
const H = 4096

function grid(width: number, height: number): Float32Array {
  const g = new Float32Array(width * height)
  for (let i = 0; i < g.length; i++) g[i] = (i * 7919) % 1000 / 1000 // deterministic noise
  return g
}

function isSymmetric(h: Float32Array, w: number, hh: number, mode: SymmetryMode): boolean {
  for (let j = 0; j < hh; j++) {
    for (let i = 0; i < w; i++) {
      const [ti, tj] = transformPoint(mode, i, j, w - 1, hh - 1)
      if (h[j * w + i] !== h[Math.round(tj) * w + Math.round(ti)]) return false
    }
  }
  return true
}

describe('transformPoint', () => {
  it('is its own inverse for every mode', () => {
    const modes: SymmetryMode[] = ['mirrorX', 'mirrorZ', 'rotate180', 'diagonal', 'antiDiagonal']
    for (const mode of modes) {
      const [x1, z1] = transformPoint(mode, 1000, 300, W, H)
      const [x2, z2] = transformPoint(mode, x1, z1, W, H)
      expect(x2).toBeCloseTo(1000)
      expect(z2).toBeCloseTo(300)
    }
  })
})

describe('mirrorHeights', () => {
  const cases: [SymmetryMode, number, number][] = [
    ['mirrorX', 9, 7],
    ['mirrorZ', 9, 7],
    ['rotate180', 9, 7],
    ['diagonal', 9, 9],
    ['antiDiagonal', 9, 9]
  ]
  for (const [mode, w, h] of cases) {
    for (const side of sourceSidesFor(mode)) {
      it(`${mode} from ${side} produces an exactly symmetric grid`, () => {
        const result = mirrorHeights(grid(w, h), w, h, mode, side)
        expect(isSymmetric(result, w, h, mode)).toBe(true)
      })
    }
  }

  it('keeps the source half untouched', () => {
    const src = grid(9, 9)
    const result = mirrorHeights(src, 9, 9, 'mirrorX', 'left')
    for (let j = 0; j < 9; j++) for (let i = 0; i < 4; i++) expect(result[j * 9 + i]).toBe(src[j * 9 + i])
  })
})

describe('mirrorMetalSpots', () => {
  it('replaces the target half with mirrored source spots and keeps on-axis spots once', () => {
    const spots = [
      { x: 500, z: 800, metal: 2 }, // source (left)
      { x: 3000, z: 100, metal: 3 }, // target — removed
      { x: W / 2, z: 2000, metal: 4 } // on the axis — kept once
    ]
    const result = mirrorMetalSpots(spots, 'mirrorX', 'left', W, H)
    expect(result).toEqual([
      { x: 500, z: 800, metal: 2 },
      { x: W / 2, z: 2000, metal: 4 },
      { x: W - 500, z: 800, metal: 2 }
    ])
  })
})

describe('mirrorStartboxes', () => {
  const config: StartboxConfig = {
    teams: [
      { nameLong: 'West', nameShort: 'W', startpoints: [[500, 2000]], boxes: [[[0, 0], [1000, 0], [1000, H], [0, H]]] },
      { nameLong: 'East', nameShort: 'E', startpoints: [[3500, 1000]], boxes: [[[3000, 0], [W, 0], [W, 1500], [3000, 1500]]] }
    ],
    supportedPlayerCounts: [2]
  }

  it('replaces the target team in place, keeping its name', () => {
    const result = mirrorStartboxes(config, 'mirrorX', 'left', W, H)
    expect(result.teams).toHaveLength(2)
    expect(result.teams[0]).toBe(config.teams[0])
    expect(result.teams[1].nameLong).toBe('East')
    expect(result.teams[1].startpoints).toEqual([[W - 500, 2000]])
    // Reflection reverses the vertex order so the polygon keeps its winding.
    expect(result.teams[1].boxes[0]).toEqual([[W, H], [W - 1000, H], [W - 1000, 0], [W, 0]])
  })

  it('keeps vertex order for 180° rotation', () => {
    const westBottom = { ...config, teams: [{ ...config.teams[0], startpoints: [[500, 3000]] as [number, number][] }, config.teams[1]] }
    const result = mirrorStartboxes(westBottom, 'rotate180', 'top', W, H)
    // East (start at z=1000) is in the top half and is the source; West (z=3000) gets replaced.
    expect(result.teams[0].nameLong).toBe('West')
    expect(result.teams[0].startpoints).toEqual([[W - 3500, H - 1000]])
    expect(result.teams[0].boxes[0]).toEqual([[W - 3000, H], [0, H], [0, H - 1500], [W - 3000, H - 1500]])
    expect(result.teams[1]).toBe(westBottom.teams[1])
  })
})

describe('feature rotation', () => {
  it('mirrors the heading vector correctly', () => {
    const heading = (r: number): [number, number] => [Math.sin(r), Math.cos(r)]
    const r = 0.7
    const [hx, hz] = heading(r)
    const check = (mode: SymmetryMode, expected: [number, number]): void => {
      const [mx, mz] = heading(transformRotation(mode, r))
      expect(mx).toBeCloseTo(expected[0])
      expect(mz).toBeCloseTo(expected[1])
    }
    check('mirrorX', [-hx, hz])
    check('mirrorZ', [hx, -hz])
    check('rotate180', [-hx, -hz])
    check('diagonal', [hz, hx])
    check('antiDiagonal', [-hz, -hx])
  })
})

describe('mirrorPartner', () => {
  it('returns null on the axis and the mirrored point elsewhere', () => {
    expect(mirrorPartner('mirrorX', W / 2, 100, W, H)).toBeNull()
    expect(mirrorPartner('mirrorX', 100, 100, W, H)).toEqual([W - 100, 100])
    expect(mirrorPartner('none', 100, 100, W, H)).toBeNull()
  })
})
