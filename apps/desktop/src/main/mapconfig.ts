import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MapInfo, MetalLayout, Point2D, StartboxConfig } from '@zk-map/map-lua'

/** The subset of mapinfo.lua fields edited directly (name/author/etc. come from project.json). */
export type GameplaySettings = Omit<
  MapInfo,
  'name' | 'shortName' | 'description' | 'author' | 'version' | 'mapFile'
>

const GAMEPLAY_FILE = join('source', 'gameplay-settings.json')
const STARTBOXES_FILE = join('source', 'startboxes.json')
const METAL_LAYOUT_FILE = join('source', 'metal-layout.json')

const DEFAULT_GAMEPLAY_SETTINGS: GameplaySettings = {
  gravity: 130,
  tidalStrength: 0,
  maxMetal: 0.02,
  extractorRadius: 500,
  minWind: 0,
  maxWind: 20,
  minHeight: -200,
  maxHeight: 200
}

async function readJsonFile<T>(projectPath: string, relativePath: string, fallback: T): Promise<T> {
  const file = join(projectPath, relativePath)
  if (!existsSync(file)) return fallback
  const raw = await readFile(file, 'utf-8')
  return JSON.parse(raw) as T
}

async function writeJsonFile(projectPath: string, relativePath: string, data: unknown): Promise<void> {
  const file = join(projectPath, relativePath)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
}

export async function loadGameplaySettings(projectPath: string): Promise<GameplaySettings> {
  return readJsonFile(projectPath, GAMEPLAY_FILE, DEFAULT_GAMEPLAY_SETTINGS)
}

export async function saveGameplaySettings(
  projectPath: string,
  settings: GameplaySettings
): Promise<void> {
  await writeJsonFile(projectPath, GAMEPLAY_FILE, settings)
}

function createDefaultStartboxes(worldWidth: number, worldHeight: number): StartboxConfig {
  const stripWidth = worldWidth * 0.25
  const west: Point2D[] = [
    [0, 0],
    [stripWidth, 0],
    [stripWidth, worldHeight],
    [0, worldHeight]
  ]
  const east: Point2D[] = [
    [worldWidth - stripWidth, 0],
    [worldWidth, 0],
    [worldWidth, worldHeight],
    [worldWidth - stripWidth, worldHeight]
  ]
  return {
    teams: [
      {
        nameLong: 'West',
        nameShort: 'West',
        startpoints: [[stripWidth / 2, worldHeight / 2]],
        boxes: [west]
      },
      {
        nameLong: 'Ost',
        nameShort: 'Ost',
        startpoints: [[worldWidth - stripWidth / 2, worldHeight / 2]],
        boxes: [east]
      }
    ],
    supportedPlayerCounts: [2]
  }
}

export async function loadStartboxes(
  projectPath: string,
  worldWidth: number,
  worldHeight: number
): Promise<StartboxConfig> {
  return readJsonFile(projectPath, STARTBOXES_FILE, createDefaultStartboxes(worldWidth, worldHeight))
}

export async function saveStartboxes(projectPath: string, config: StartboxConfig): Promise<void> {
  await writeJsonFile(projectPath, STARTBOXES_FILE, config)
}

export async function loadMetalLayout(projectPath: string): Promise<MetalLayout> {
  return readJsonFile(projectPath, METAL_LAYOUT_FILE, { spots: [] })
}

export async function saveMetalLayout(projectPath: string, layout: MetalLayout): Promise<void> {
  await writeJsonFile(projectPath, METAL_LAYOUT_FILE, layout)
}
