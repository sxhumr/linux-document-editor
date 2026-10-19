/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // The bundle is embedded in the C++ binary and served from pagelite://app/,
    // so there is no CDN to split for and no need for source maps in release.
    target: 'es2023',
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'jsdom',
  },
});
