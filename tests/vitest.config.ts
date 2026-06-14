import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  // The React plugin lets .tsx render smoke-tests transform JSX exactly like the
  // app build. Pure .ts logic tests are unaffected (no JSX to transform).
  plugins: [react()],
  test: {
    // Node by default; render smoke-tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` docblock, so logic tests stay fast.
    environment: 'node',
    globals: false,
    restoreMocks: true,
    include: ['tests/**/*.test.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../src/shared'),
      '@': resolve(__dirname, '../src/renderer/src')
    }
  }
})
