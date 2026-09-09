import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    testTimeout: 30000,
    // The reminder scan (Story 4.4) is a system-wide sweep: with several e2e
    // files booting AppModule in parallel against one database, a stray 60s
    // tick would steal the seeded creation inside the Story 4.4 block. e2e
    // triggers the scan explicitly via ReminderSchedulerService.runOnce().
    env: { REMINDER_SCAN_ENABLED: 'false' },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
