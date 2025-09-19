import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3004',
      '/crawl': 'http://localhost:3004',
      '/events': 'http://localhost:3004',
      '/queue': 'http://localhost:3004'
    }
  },
  build: {
    outDir: 'dist-frontend'
  }
})
