// Local run of the e2e suite with the installed Edge and an already running preview server
// (pnpm is not on PATH here, so the base config's webServer command cannot start).
import base from '../playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  testDir: '../tests',
  webServer: undefined,
  use: { ...base.use, channel: 'msedge' },
  projects: base.projects?.map((p) => ({ ...p, use: { ...p.use, channel: 'msedge' } })),
});
