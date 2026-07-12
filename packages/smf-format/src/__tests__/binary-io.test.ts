import { describe, expect, it } from 'vitest'
import { BinaryReader, BinaryWriter } from '../binary-io'

describe('BinaryWriter/BinaryReader', () => {
  it('round-trips all primitive field types', () => {
    const w = new BinaryWriter(8) // tiny initial capacity to also exercise buffer growth
    w.fixedString('spring map file', 16)
    w.int32(-42)
    w.uint32(0xdeadbeef)
    w.uint16(4242)
    w.uint8(7)
    w.float32(3.5)
    w.cString('hello.smt')
    w.int32Array([1, -2, 3, -4])
    w.uint16Array([10, 20, 30])

    const bytes = w.toUint8Array()
    const r = new BinaryReader(bytes)

    expect(r.fixedString(16)).toBe('spring map file')
    expect(r.int32()).toBe(-42)
    expect(r.uint32()).toBe(0xdeadbeef)
    expect(r.uint16()).toBe(4242)
    expect(r.uint8()).toBe(7)
    expect(r.float32()).toBeCloseTo(3.5)
    expect(r.cString()).toBe('hello.smt')
    expect(Array.from(r.int32Array(4))).toEqual([1, -2, 3, -4])
    expect(Array.from(r.uint16Array(3))).toEqual([10, 20, 30])
  })

  it('truncates fixedString at NUL when reading', () => {
    const w = new BinaryWriter()
    w.fixedString('abc', 16)
    const r = new BinaryReader(w.toUint8Array())
    expect(r.fixedString(16)).toBe('abc')
  })

  it('seek() repositions the read cursor', () => {
    const w = new BinaryWriter()
    w.int32(111)
    w.int32(222)
    w.int32(333)
    const r = new BinaryReader(w.toUint8Array())
    r.seek(8)
    expect(r.int32()).toBe(333)
    r.seek(0)
    expect(r.int32()).toBe(111)
  })
})
