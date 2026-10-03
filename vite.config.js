import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    // Keep the junction path (Documents\\peak-rival-arena) instead of resolving
    // it to C:\\Dev\\peak-rival-arena during production builds. Vite/Rollup can
    // otherwise emit an absolute source path as an asset name.
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
