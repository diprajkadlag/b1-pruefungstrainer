import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// BASE_PATH lets the same build serve from a user site ("/") or from a project
// page ("/german-exam-trainer/"). The GitHub Pages workflow sets it.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@pruefung/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'GermanExamTrainer — Deutsch A1 bis B2',
        short_name: 'GermanExamTrainer',
        description:
          'Übungsprüfungen im Format der deutschen A1-, A2-, B1- und B2-Zertifikatsprüfungen — mit Timer, Hörtexten und automatischer Auswertung.',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2f3e4e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Audio is far larger than Workbox's default precache ceiling, and it
        // must be cacheable for the listening module to work offline.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        runtimeCaching: [
          {
            urlPattern: /\/content\/.*\.(mp3|ogg|wav)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'b1-audio',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            urlPattern: /\/content\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'b1-inhalte' },
          },
          {
            // Opened once, kept. Someone who pulls up the papers to print
            // them should still have them on a train with no signal.
            urlPattern: /\/content\/.*\.pdf$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'b1-pdf',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
