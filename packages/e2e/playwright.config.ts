// Playwright config for the UI smoke suite.
// The webServer builds the client and serves its dist/ with vite preview on a fixed port;
// Playwright starts and stops the server itself (reuseExistingServer: false so a stray
// server from another session can never mask a broken build).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Whole suite must stay under 3 minutes; one worker = sequential hot-seat tests.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4398',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    // Machines whose preinstalled Chromium does not match this Playwright version can point at it.
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      testIgnore: /mobile\.spec\.ts/,
      use: { viewport: { width: 1024, height: 768 } },
    },
    // Phone layout (table/mobile.css): touch, 390 x 844 portrait; the spec turns it to landscape
    // itself. Only mobile.spec.ts runs here (the desktop specs assume the desktop table).
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command:
      'pnpm --filter @hexgame/client build && pnpm --filter @hexgame/client exec vite preview --port 4398 --strictPort',
    url: 'http://localhost:4398',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
