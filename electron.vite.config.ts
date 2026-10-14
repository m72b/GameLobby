import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: resolve('src/preload/index.ts') } } },
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer'), '@shared': resolve('src/shared') } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: { main: resolve('src/renderer/index.html'), settings: resolve('src/renderer/settings.html') } } }
  }
})
