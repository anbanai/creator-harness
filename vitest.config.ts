import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['dsh/tests/**/*.test.ts'],
  },
})
