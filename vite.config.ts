/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // The one Pages-specific config — keep the app an otherwise host-portable static SPA.
  base: '/referee-scheduler/',
  plugins: [react()],
  test: {
    // Tests target the pure, DOM-free layers (domain/model/import/persistence/i18n). No React
    // component tests for MVP (UI validated visually) — UI dirs create no *.test.ts.
    include: ['src/**/*.test.ts'],
  },
})
