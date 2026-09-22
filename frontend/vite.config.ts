import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Point the dev proxy at a non-default API port with:
  //   VITE_API_TARGET=http://127.0.0.1:8010 npm run dev
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:8000'

  return {
  plugins: [react()],
  server: {
    port: Number(env.VITE_PORT) || 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // SSE needs an open pipe; buffering the proxied response would defeat
        // the whole point of streaming the assistant's answer.
        ws: true,
      },
    },
  },
  build: {
    // Charting and animation are the two heavyweights and they change on a
    // different cadence than app code. Splitting them means a UI tweak doesn't
    // invalidate 400 kB of vendor cache for every returning user.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          query: ['@tanstack/react-query', 'axios'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  }
})
