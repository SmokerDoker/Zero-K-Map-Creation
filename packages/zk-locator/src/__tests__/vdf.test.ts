import { describe, expect, it } from 'vitest'
import { extractInstallDir, extractLibraryPaths } from '../vdf'

describe('extractLibraryPaths', () => {
  it('extracts and unescapes every library path from a realistic libraryfolders.vdf', () => {
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"label"		""
		"apps"
		{
			"334920"		"1234567890"
		}
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
		"apps"
		{
		}
	}
}`
    expect(extractLibraryPaths(vdf)).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary'
    ])
  })

  it('returns an empty array for content with no path entries', () => {
    expect(extractLibraryPaths('"libraryfolders" {}')).toEqual([])
  })
})

describe('extractInstallDir', () => {
  it('reads the installdir field from an appmanifest .acf file', () => {
    const acf = `"AppState"
{
	"appid"		"334920"
	"universe"		"1"
	"name"		"Zero-K"
	"installdir"		"Zero-K"
}`
    expect(extractInstallDir(acf)).toBe('Zero-K')
  })

  it('returns null when there is no installdir field', () => {
    expect(extractInstallDir('"AppState" { "appid" "1" }')).toBeNull()
  })
})
