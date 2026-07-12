/** Little-endian cursor reader over an ArrayBuffer-backed view, matching the SMF/SMT on-disk layout. */
export class BinaryReader {
  private readonly view: DataView
  private readonly bytes: Uint8Array
  offset: number

  constructor(data: Uint8Array, offset = 0) {
    this.bytes = data
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    this.offset = offset
  }

  get length(): number {
    return this.bytes.byteLength
  }

  seek(offset: number): void {
    this.offset = offset
  }

  int32(): number {
    const v = this.view.getInt32(this.offset, true)
    this.offset += 4
    return v
  }

  uint32(): number {
    const v = this.view.getUint32(this.offset, true)
    this.offset += 4
    return v
  }

  uint16(): number {
    const v = this.view.getUint16(this.offset, true)
    this.offset += 2
    return v
  }

  uint8(): number {
    const v = this.view.getUint8(this.offset)
    this.offset += 1
    return v
  }

  float32(): number {
    const v = this.view.getFloat32(this.offset, true)
    this.offset += 4
    return v
  }

  /** Reads a fixed-length byte range (e.g. a magic string field) without any encoding assumptions. */
  bytesFixed(length: number): Uint8Array {
    const v = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return v
  }

  /** Reads a fixed-length field as a trimmed ASCII string (up to the first NUL byte). */
  fixedString(length: number): string {
    const raw = this.bytesFixed(length)
    const nul = raw.indexOf(0)
    return asciiDecode(nul === -1 ? raw : raw.subarray(0, nul))
  }

  /** Reads a NUL-terminated ASCII string of variable length. */
  cString(): string {
    const start = this.offset
    while (this.bytes[this.offset] !== 0) {
      if (this.offset >= this.bytes.byteLength) {
        throw new Error('Unterminated C string while reading binary map data')
      }
      this.offset++
    }
    const str = asciiDecode(this.bytes.subarray(start, this.offset))
    this.offset++ // skip NUL
    return str
  }

  uint16Array(count: number): Uint16Array {
    const out = new Uint16Array(count)
    for (let i = 0; i < count; i++) out[i] = this.uint16()
    return out
  }

  uint8Array(count: number): Uint8Array {
    const out = this.bytes.slice(this.offset, this.offset + count)
    this.offset += count
    return out
  }

  int32Array(count: number): Int32Array {
    const out = new Int32Array(count)
    for (let i = 0; i < count; i++) out[i] = this.int32()
    return out
  }
}

/** Growable little-endian binary writer matching the SMF/SMT on-disk layout. */
export class BinaryWriter {
  private buffer: Uint8Array
  private view: DataView
  private cursor = 0

  constructor(initialCapacity = 4096) {
    this.buffer = new Uint8Array(initialCapacity)
    this.view = new DataView(this.buffer.buffer)
  }

  get offset(): number {
    return this.cursor
  }

  private ensureCapacity(extra: number): void {
    if (this.cursor + extra <= this.buffer.byteLength) return
    let newSize = this.buffer.byteLength * 2
    while (newSize < this.cursor + extra) newSize *= 2
    const grown = new Uint8Array(newSize)
    grown.set(this.buffer)
    this.buffer = grown
    this.view = new DataView(this.buffer.buffer)
  }

  int32(v: number): this {
    this.ensureCapacity(4)
    this.view.setInt32(this.cursor, v, true)
    this.cursor += 4
    return this
  }

  uint32(v: number): this {
    this.ensureCapacity(4)
    this.view.setUint32(this.cursor, v, true)
    this.cursor += 4
    return this
  }

  uint16(v: number): this {
    this.ensureCapacity(2)
    this.view.setUint16(this.cursor, v, true)
    this.cursor += 2
    return this
  }

  uint8(v: number): this {
    this.ensureCapacity(1)
    this.view.setUint8(this.cursor, v)
    this.cursor += 1
    return this
  }

  float32(v: number): this {
    this.ensureCapacity(4)
    this.view.setFloat32(this.cursor, v, true)
    this.cursor += 4
    return this
  }

  bytes(data: Uint8Array): this {
    this.ensureCapacity(data.byteLength)
    this.buffer.set(data, this.cursor)
    this.cursor += data.byteLength
    return this
  }

  /** Writes `length` bytes total: the ASCII string followed by NUL padding. Truncates if too long. */
  fixedString(value: string, length: number): this {
    this.ensureCapacity(length)
    const encoded = asciiEncode(value).subarray(0, length)
    this.buffer.set(encoded, this.cursor)
    // remaining bytes already zero-initialized
    this.cursor += length
    return this
  }

  cString(value: string): this {
    const encoded = asciiEncode(value)
    this.bytes(encoded)
    this.uint8(0)
    return this
  }

  uint16Array(values: Uint16Array | number[]): this {
    for (const v of values) this.uint16(v)
    return this
  }

  int32Array(values: Int32Array | number[]): this {
    for (const v of values) this.int32(v)
    return this
  }

  toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.cursor)
  }
}

function asciiEncode(value: string): Uint8Array {
  const out = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff
  return out
}

function asciiDecode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.byteLength; i++) out += String.fromCharCode(bytes[i])
  return out
}
