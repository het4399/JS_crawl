import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    watch:{
      ignored: ['**/storage/**', '**/dist/**', '**/node_modules/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      },
      '/crawl': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      },
      '/events': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        secure: false,
        timeout: 0,
        ws: false,
        headers: {
          Connection: 'keep-alive',
          Accept: 'text/event-stream'
        },
      },
      '/queue': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      }
    }
  },
  build: {
    outDir: 'dist-frontend'
  }
})
