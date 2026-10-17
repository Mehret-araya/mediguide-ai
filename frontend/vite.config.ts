
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Configure Vite and forward API requests to the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
