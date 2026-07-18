/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // The one Pages-specific config — keep the app an otherwise host-portable static SPA.
  base: '/referee-scheduler/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Tests target the pure, DOM-free layers (domain/model/import/persistence/i18n). No React
    // component tests for MVP (UI validated visually) — UI dirs create no *.test.ts.
    include: ['src/**/*.test.ts'],
  },
})
