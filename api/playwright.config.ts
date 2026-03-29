import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PureUrban API & E2E tests.
 *
 * - Project "api": pure API tests (no browser) — testes de integração REST
 * - Project "e2e": browser-based E2E tests (futuro — mobile web ou admin panel)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        // No browser — pure API testing
      },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  /* Timeout configuration */
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
});
