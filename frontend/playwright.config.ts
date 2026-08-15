import { defineConfig, devices } from '@playwright/test';

/**
 * Committed Playwright suite (Milestone 2 "Playwright") - replaces the
 * ad-hoc scratchpad scripts used in earlier phases. Assumes the backend API
 * is already running and reachable (same requirement as the backend's own
 * e2e suite: a migrated + seeded Postgres, see backend/README.md) - this
 * config only starts the frontend dev server itself, since coordinating
 * database setup is not something Playwright's webServer can express
 * generically. See docs/TESTING.md "Playwright" for the exact local/CI
 * sequence.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Pinned executable for environments with a pre-installed, differently-
    // versioned Chromium (see docs/TESTING.md "Playwright"); falls back to
    // Playwright's own managed browser download when unset/absent.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
