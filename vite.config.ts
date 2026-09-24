import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // GitHub's runners are about 5× slower than a laptop, so the 5 s default
    // fails tests that take ~1 s locally (see docs/DECISIONS.md, Testing).
    testTimeout: 60_000,
  },
});
