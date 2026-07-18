/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // The one Pages-specific config — keep the app an otherwise host-portable static SPA.
  base: '/referee-scheduler/',
  plugins: [react()],
  test: {
    // Tests target the pure, DOM-free domain core only (MVP).
    include: ['src/domain/**/*.test.ts'],
  },
})
