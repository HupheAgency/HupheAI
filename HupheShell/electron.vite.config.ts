import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

// Vite plugin: copy Python scripts next to the compiled main bundle
// so __dirname/<script>.py resolves correctly at runtime.
function copyPythonScripts(): import('vite').Plugin {
  const scripts = ['parse_key.py', 'write_key.py', 'parse_key_slides.py', 'lib/colmap_sfm.py']
  return {
    name: 'copy-python-scripts',
    closeBundle() {
      for (const script of scripts) {
        const src  = resolve(__dirname, 'src/main', script)
        const dest = resolve(__dirname, 'out/main', script)
        if (existsSync(src)) {
          mkdirSync(dirname(dest), { recursive: true })
          copyFileSync(src, dest)
          console.log(`[copy-python-scripts] ${script} → out/main/${script}`)
        }
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyPythonScripts()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
