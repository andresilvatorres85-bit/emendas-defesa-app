import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' -> caminhos relativos, funciona em qualquer subpasta do GitHub Pages
// (ex.: https://usuario.github.io/nome-do-repo/)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
})
