import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const native = mode === 'ios';
  const nativeApi = process.env.VITE_NATIVE_API_URL || 'https://www.topfragg.gg/api';
  if (native) {
    const url = new URL(nativeApi);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api') {
      throw new Error('VITE_NATIVE_API_URL must be an HTTPS URL ending in /api.');
    }
  }
  return {
    ...(native ? { define: {
      'import.meta.env.VITE_NATIVE_APP': JSON.stringify('true'),
      'import.meta.env.VITE_API_URL': JSON.stringify(nativeApi),
    }, build: { outDir: 'dist-ios' } } : {}),
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
  };
});
