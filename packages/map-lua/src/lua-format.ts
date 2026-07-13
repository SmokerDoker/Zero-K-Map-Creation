/** Formats a JS string as a double-quoted Lua string literal, escaping as needed. */
export function luaString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
  return `"${escaped}"`
}

/** Formats a finite JS number as a Lua numeric literal. */
export function luaNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot serialize non-finite number to Lua: ${value}`)
  }
  return String(value)
}

function indent(level: number): string {
  return '  '.repeat(level)
}

/** Formats a flat array of [x, z] points as `{ {x, z}, {x, z}, ... }`. */
export function luaPointArray(points: readonly (readonly [number, number])[], level: number): string {
  if (points.length === 0) return '{}'
  const lines = points.map((p) => `${indent(level + 1)}{${luaNumber(p[0])}, ${luaNumber(p[1])}},`)
  return `{\n${lines.join('\n')}\n${indent(level)}}`
}
