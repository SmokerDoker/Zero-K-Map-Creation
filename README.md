# Zero-K Map Creator

Eine plattformübergreifende Desktop-App (Windows/macOS/Linux) zum Erstellen, Bearbeiten, Testen und Veröffentlichen von Custom Maps für [Zero-K](https://zero-k.info), das Open-Source-RTS auf Basis der Spring-Engine.

## Warum

Zero-K unterstützt Custom Maps, aber der offizielle Workflow ist stark fragmentiert: Heightmap/Textur in externen Bildeditoren pixelgenau vorbereiten, Kompilierung über ein separates Tool (`pymapconv`/`MapConvNG`), Metal-Spots und Startboxen über In-Game-Widgets mit manuellem Copy-Paste in Lua-Dateien, Feature-Platzierung über ein weiteres externes Tool, und ein fehleranfälliges manuelles `.sd7`-Packaging.

Dieses Projekt vereint den kompletten Workflow in einer einzigen GUI-Anwendung:

- Terrain (Heightmap) und Textur direkt in der App malen, mit 3D-Live-Vorschau
- Metal-Spots, Startboxen und Features visuell platzieren
- Kompilierung zu `.smf`/`.smt` **ohne externe Tools** (eigener, plattformunabhängiger Encoder/Decoder)
- Ein-Klick-Packaging als `.sd7`
- Lokales Testen direkt aus der App (automatische Zero-K-Erkennung via Steam oder Standalone-Installation)
- Veröffentlichung/Upload-Unterstützung

## Status

🚧 Frühe Entwicklungsphase. Siehe [Projektplan](#) (folgt) für Architektur und Meilensteine.

## Tech-Stack

Electron, React, TypeScript, Vite, three.js/`@react-three/fiber`, `electron-builder`.

## Lizenz

[GPL-2.0](LICENSE) — wie Zero-K selbst.
