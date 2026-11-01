
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Configure Vite to forward frontend API requests to the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
