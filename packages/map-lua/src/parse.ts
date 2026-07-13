import * as luaparse from 'luaparse'
import type { MapInfo, MetalLayout, Point2D, StartboxConfig, StartboxTeam } from './types'

/**
 * Evaluates a restricted subset of Lua expressions — literals and table constructors only,
 * no function calls or arithmetic beyond unary minus — into plain JS values. This is enough to
 * read mapinfo.lua/map_startboxes.lua/map_metal_layout.lua files, which are always simple data
 * literals (optionally assigned to a `local` before being returned), never executable logic.
 */
function evalLuaLiteral(node: luaparse.Expression): unknown {
  switch (node.type) {
    case 'StringLiteral':
      return String((node as unknown as { value: string }).value)
    case 'NumericLiteral':
      return (node as unknown as { value: number }).value
    case 'BooleanLiteral':
      return (node as unknown as { value: boolean }).value
    case 'NilLiteral':
      return null
    case 'UnaryExpression': {
      const unary = node as luaparse.UnaryExpression
      if (unary.operator === '-') return -(evalLuaLiteral(unary.argument) as number)
      throw new Error(`Nicht unterstützter unärer Operator in Lua-Literal: ${unary.operator}`)
    }
    case 'TableConstructorExpression': {
      const table = node as luaparse.TableConstructorExpression
      const isArray = table.fields.every((f) => f.type === 'TableValue')
      if (isArray) {
        return table.fields.map((f) => evalLuaLiteral((f as luaparse.TableValue).value))
      }
      const obj: Record<string, unknown> = {}
      let autoIndex = 1
      for (const field of table.fields) {
        if (field.type === 'TableKeyString') {
          obj[field.key.name] = evalLuaLiteral(field.value)
        } else if (field.type === 'TableKey') {
          const key = evalLuaLiteral(field.key as luaparse.Expression)
          obj[String(key)] = evalLuaLiteral(field.value)
        } else {
          obj[String(autoIndex++)] = evalLuaLiteral(field.value)
        }
      }
      return obj
    }
    default:
      throw new Error(
        `Nicht unterstützter Lua-Ausdruck beim Einlesen der Map-Konfiguration: ${node.type}`
      )
  }
}

function collectLocals(body: luaparse.Statement[]): Map<string, luaparse.Expression> {
  const locals = new Map<string, luaparse.Expression>()
  for (const statement of body) {
    if (statement.type === 'LocalStatement') {
      const local = statement as luaparse.LocalStatement
      for (let i = 0; i < local.variables.length && i < local.init.length; i++) {
        locals.set(local.variables[i].name, local.init[i])
      }
    }
  }
  return locals
}

function resolveExpression(
  expr: luaparse.Expression,
  locals: Map<string, luaparse.Expression>
): luaparse.Expression {
  if (expr.type === 'Identifier') {
    const resolved = locals.get((expr as luaparse.Identifier).name)
    if (resolved) return resolved
  }
  return expr
}

/** Parses a `local x = {...} ... return x[, y]` style file and evaluates each returned value. */
function parseReturnedLiterals(source: string): unknown[] {
  // luaparse's default "none" encoding mode discards string literal values entirely (`.value`
  // comes back null) — "pseudo-latin1" is the mode that actually preserves them.
  const ast = luaparse.parse(source, { comments: false, encodingMode: 'pseudo-latin1' }) as unknown as {
    body: luaparse.Statement[]
  }
  const locals = collectLocals(ast.body)
  const returnStatement = ast.body.find((s) => s.type === 'ReturnStatement') as
    | luaparse.ReturnStatement
    | undefined
  if (!returnStatement) {
    throw new Error('Lua-Datei enthält kein return-Statement')
  }
  return returnStatement.arguments.map((arg) => evalLuaLiteral(resolveExpression(arg, locals)))
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asPoint2D(value: unknown): Point2D {
  const arr = asArray(value)
  return [Number(arr[0]), Number(arr[1])]
}

export function parseMapInfoLua(source: string): MapInfo {
  const [table] = parseReturnedLiterals(source)
  const info = asRecord(table)
  const smf = asRecord(info.smf)
  return {
    name: String(info.name ?? ''),
    shortName: String(info.shortname ?? ''),
    description: String(info.description ?? ''),
    author: String(info.author ?? ''),
    version: String(info.version ?? ''),
    mapFile: String(info.mapfile ?? ''),
    gravity: Number(info.gravity ?? 130),
    tidalStrength: Number(info.tidalStrength ?? 0),
    maxMetal: Number(info.maxMetal ?? 0.02),
    extractorRadius: Number(info.extractorRadius ?? 500),
    minWind: Number(info.minWind ?? 0),
    maxWind: Number(info.maxWind ?? 0),
    minHeight: Number(smf.minheight ?? 0),
    maxHeight: Number(smf.maxheight ?? 100)
  }
}

export function parseStartboxesLua(source: string): StartboxConfig {
  const [teamsRaw, countsRaw] = parseReturnedLiterals(source)
  const teams: StartboxTeam[] = asArray(teamsRaw).map((teamValue) => {
    const team = asRecord(teamValue)
    return {
      nameLong: String(team.nameLong ?? ''),
      nameShort: String(team.nameShort ?? ''),
      startpoints: asArray(team.startpoints).map(asPoint2D),
      boxes: asArray(team.boxes).map((box) => asArray(box).map(asPoint2D))
    }
  })
  const supportedPlayerCounts = asArray(countsRaw).map((n) => Number(n))
  return { teams, supportedPlayerCounts }
}

export function parseMetalLayoutLua(source: string): MetalLayout {
  const [table] = parseReturnedLiterals(source)
  const layout = asRecord(table)
  const spots = asArray(layout.spots).map((spotValue) => {
    const spot = asRecord(spotValue)
    return {
      x: Number(spot.x),
      z: Number(spot.z),
      metal: spot.metal !== undefined ? Number(spot.metal) : undefined
    }
  })
  return { spots }
}
