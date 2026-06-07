import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    host: true, // expose on LAN so a phone can hit it
  },
})
