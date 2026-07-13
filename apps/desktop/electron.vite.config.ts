import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Our @zk-map/* workspace packages ship raw TypeScript (main: "./src/index.ts") for the renderer's
// Vite pipeline to bundle directly. The main/preload builds only externalize real node_modules
// dependencies — externalizing a workspace package would leave a `require("@zk-map/...")` in the
// output that Node can't resolve (no .ts loader), so these must stay excluded and get bundled in.
const WORKSPACE_PACKAGES = [
  '@zk-map/shared-types',
  '@zk-map/smf-format',
  '@zk-map/map-lua',
  '@zk-map/zk-locator'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
