# Zero-K Map Creator

A cross-platform desktop app (Windows, macOS, Linux) for creating, editing, testing and publishing custom maps for [Zero-K](https://zero-k.info), the open-source RTS built on the Spring/Recoil engine.

> **Status: early alpha.** The core workflow (sculpt terrain → place mexes, start boxes and features → compile → test in Zero-K) works and has been verified in-game. Expect rough edges, and please report what breaks.

## Why

Zero-K supports custom maps, but the classic workflow is spread across many tools: preparing heightmaps pixel-perfect in an image editor, compiling with a separate converter (`pymapconv`/`MapConvNG`), placing metal spots and start boxes with in-game widgets and copy-pasting the result into Lua files, and packaging the `.sd7` by hand.

This app puts that workflow into one GUI.

## Features

- **Terrain sculpting** with a live 3D preview: raise, lower, smooth and flatten brushes; sea level is shown in the preview.
- **Heightmap import/export**: PNG (8- or 16-bit) or 16-bit RAW (World Machine, Gaea, …). Other sizes are resampled. Export is 16-bit PNG.
- **Symmetry tools**: mirror left↔right or top↔bottom, rotate 180°, or mirror along a diagonal (square maps). You can copy one half onto the other (terrain, mexes, start boxes, features), or turn on *live mirror* so brush strokes and new mexes are mirrored as you edit.
- **Metal spots (mexes)**: click to place, drag to move, set the yield per spot. Written to `mapconfig/map_metal_layout.lua`.
- **Start boxes**: any number of teams (1v1 up to FFA), drag corners and start points. Written to `mapconfig/map_startboxes.lua`.
- **Features**: place and rotate objects by FeatureDef name (see limitations).
- **Map info**: name, version, author, description and gameplay values (gravity, wind, tidal strength, height range, …).
- **Undo / redo** for every edit (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z).
- **Warnings about unsaved changes** when leaving the editor or closing the app. Ctrl+S saves.
- **Compiler with no external tools**: a built-in SMF/SMT encoder plus `.sd7` packaging. It runs in a background thread with a progress bar and can be cancelled.
- **Test in Zero-K**: detects Steam and standalone installs, copies the map into `maps/` and starts the launcher.
- **Publishing helper**: prepares the versioned `.sd7` and opens the springfiles upload page. There is no upload API, so the upload itself is manual.
- **Languages**: English and German, switchable in the app.

## Limitations

- **No texture painting yet.** The ground texture is generated from the heightmap: colors by height, plus slope shading. There are no splat, normal or specular maps.
- **Features need matching FeatureDefs.** The app writes feature names into the map, but it doesn't bundle any feature models. A name only shows up in game if a FeatureDef with that exact name is available to the map.
- **No lighting, atmosphere or water settings** in `mapinfo.lua` yet. Engine defaults are used.
- **"Test in Zero-K" can't open the map directly.** It starts Zero-K, and you then pick the map in the skirmish menu. If the map doesn't show up, disable *Only featured maps*.
- **Large maps (>20×20) are untested** with this compiler. Compiling them can take a long time.

## Download & install

Get the installer for your platform from the [Releases page](https://github.com/smokerdoker/zero-k-map-creation/releases):

| Platform | File |
| --- | --- |
| Windows 10/11 | `Zero-K-Map-Creator-<version>-windows-setup.exe` |
| macOS (Apple Silicon) | `Zero-K-Map-Creator-<version>-macos-arm64.dmg` |
| macOS (Intel) | `Zero-K-Map-Creator-<version>-macos-x64.dmg` |
| Linux | `Zero-K-Map-Creator-<version>-linux-x86_64.AppImage` or `-linux-amd64.deb` |

> **macOS is untested.** The maintainer doesn't own a Mac, so the macOS builds are produced by CI but have never been run by a human. If you use a Mac, please try them and [open an issue](https://github.com/smokerdoker/zero-k-map-creation/issues) with what works and what doesn't. Feedback is very welcome.

The installers are **not code-signed** yet:

- **Windows:** SmartScreen may warn about an unknown publisher. Click *More info*, then *Run anyway*.
- **macOS:** after copying the app to *Applications*, run this once in Terminal, otherwise macOS reports the app as damaged:
  ```sh
  xattr -cr "/Applications/Zero-K Map Creator.app"
  ```
- **Linux (AppImage):** run `chmod +x Zero-K-Map-Creator-*.AppImage`, then start the file.

Each push to the repository also builds installers. You can download them from the *Artifacts* section of the [CI runs](https://github.com/smokerdoker/zero-k-map-creation/actions/workflows/ci.yml).

## Quick start

1. **New project.** Choose a name and a size. Size is in Zero-K units: 8 means an 8×8 map, i.e. 512×512 squares, and it must be even.
2. **Edit map.** Sculpt the terrain or import a heightmap. Set up symmetry, then place mexes, start boxes and features. Fill in the map info. Save with **Ctrl+S**.
3. **Test in Zero-K.** This compiles the map, copies it into your Zero-K install and starts the game.
4. **Publish.** Raise the version for every public release (*Map info → Version*), compile, then upload the `.sd7` to springfiles.

Projects are plain folders (`<name>.zkmap/`) with JSON data in `source/`. Build output goes to `generated/`.

## Development

Requires Node.js ≥ 22 and pnpm (the version is pinned in `package.json`).

```sh
pnpm install
pnpm dev                                   # run the app with hot reload
pnpm -r test                               # unit tests (all packages)
pnpm --filter @zk-map/desktop typecheck
pnpm --filter @zk-map/desktop dist:linux   # build installers locally (dist:win / dist:mac on those OSes)
```

Repository layout:

| Path | Contents |
| --- | --- |
| `apps/desktop` | Electron app: main process, compile worker, React UI, translations (`src/shared/i18n`) |
| `packages/smf-format` | SMF/SMT encoder/decoder, DXT1 compression |
| `packages/map-lua` | Generates and parses `mapinfo.lua`, `map_startboxes.lua` and `map_metal_layout.lua` |
| `packages/zk-locator` | Detects Zero-K installs (Steam and standalone) |
| `packages/shared-types` | Shared project schema types |

### Adding a language

Copy `apps/desktop/src/shared/i18n/de.ts`, translate the strings and register the new language in `src/shared/i18n/index.ts`. The type checker reports any missing keys.

### Releasing

Either run the **Release** workflow manually (*Actions → Release → Run workflow*, enter a version such as `0.2.0`), or push a version tag:

```sh
git tag v0.2.0
git push origin v0.2.0
```

Both build all installers and publish them as a GitHub Release. Versions with a suffix (e.g. `0.2.0-beta.1`) become pre-releases.

## License

[GPL-2.0](LICENSE), the same license as Zero-K.
