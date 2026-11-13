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
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /board3d\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      testIgnore: /board3d\.spec\.ts/,
      use: { viewport: { width: 1024, height: 768 } },
    },
    {
      // Software WebGL (SwiftShader) so the 3D canvas renders on headless CI/office machines.
      name: '3d',
      testMatch: /board3d\.spec\.ts/,
      use: {
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
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
