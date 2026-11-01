import { describe, expect, it } from 'vitest'
import { History, applyTerrainPatch, createTerrainPatch, expandRect } from '../history'

describe('History', () => {
  it('undoes and redoes doc changes in order', () => {
    const h = new History<{ v: number }>()
    const s0 = { v: 0 }
    const s1 = { v: 1 }
    const s2 = { v: 2 }
    h.push({ label: 'a', docBefore: s0, docAfter: s1 })
    h.push({ label: 'b', docBefore: s1, docAfter: s2 })
    expect(h.undo()?.docBefore).toBe(s1)
    expect(h.undo()?.docBefore).toBe(s0)
    expect(h.canUndo).toBe(false)
    expect(h.redo()?.docAfter).toBe(s1)
    expect(h.redo()?.docAfter).toBe(s2)
    expect(h.canRedo).toBe(false)
  })

  it('drops the redo stack when a new change is pushed', () => {
    const h = new History<number>()
    h.push({ label: 'a', docBefore: 0, docAfter: 1 })
    h.undo()
    h.push({ label: 'b', docBefore: 0, docAfter: 2 })
    expect(h.canRedo).toBe(false)
    expect(h.undoLabel).toBe('b')
  })

  it('coalesces consecutive edits with the same key inside the time window', () => {
    const h = new History<string>()
    h.push({ label: 'type', docBefore: '', docAfter: 'a' }, { coalesceKey: 'name', now: 0 })
    h.push({ label: 'type', docBefore: 'a', docAfter: 'ab' }, { coalesceKey: 'name', now: 500 })
    h.push({ label: 'type', docBefore: 'ab', docAfter: 'abc' }, { coalesceKey: 'name', now: 5000 })
    const last = h.undo()
    expect(last?.docBefore).toBe('ab')
    const first = h.undo()
    expect(first?.docBefore).toBe('')
    expect(first?.docAfter).toBe('ab')
    expect(h.canUndo).toBe(false)
  })

  it('gives every state a distinct id so the workspace can track the saved state', () => {
    const h = new History<number>()
    expect(h.currentId).toBe(0)
    h.push({ label: 'a', docBefore: 0, docAfter: 1 })
    const afterA = h.currentId
    h.push({ label: 'b', docBefore: 1, docAfter: 2 })
    expect(h.currentId).not.toBe(afterA)
    h.undo()
    expect(h.currentId).toBe(afterA)
    h.undo()
    expect(h.currentId).toBe(0)
  })

  it('evicts the oldest entries when the terrain memory budget is exceeded', () => {
    const h = new History<never>(100, 1000)
    const patch = () => ({ x: 0, y: 0, width: 10, height: 10, before: new Float32Array(100), after: new Float32Array(100) })
    h.push({ label: '1', terrain: patch() }) // 800 bytes
    h.push({ label: '2', terrain: patch() }) // would be 1600 -> evicts #1
    expect(h.undo()?.label).toBe('2')
    expect(h.canUndo).toBe(false)
  })
})

describe('terrain patches', () => {
  it('captures only the changed rectangle and restores both sides', () => {
    const width = 4
    const before = new Float32Array(16).fill(0.5)
    const after = before.slice()
    after[1 * width + 2] = 0.9
    after[2 * width + 1] = 0.1
    const rect = expandRect(null, { minX: 1, minY: 1, maxX: 2, maxY: 2 })
    const patch = createTerrainPatch(before, after, width, rect)
    expect(patch).not.toBeNull()
    expect(patch!.width).toBe(2)
    expect(patch!.height).toBe(2)

    const heights = after.slice()
    applyTerrainPatch(heights, width, patch!, 'before')
    expect(Array.from(heights)).toEqual(Array.from(before))
    applyTerrainPatch(heights, width, patch!, 'after')
    expect(Array.from(heights)).toEqual(Array.from(after))
  })

  it('returns null when nothing changed', () => {
    const a = new Float32Array(9).fill(0.3)
    expect(createTerrainPatch(a, a.slice(), 3, { minX: 0, minY: 0, maxX: 2, maxY: 2 })).toBeNull()
  })
})
