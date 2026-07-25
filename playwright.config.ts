import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // The speaking module needs a microphone; grant it so the recorder can be
    // exercised without a prompt blocking the run.
    permissions: ['microphone'],
    locale: 'de-DE',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Both halves must run inside the workspace: `vite preview` resolves its
    // config and its dist/ relative to the working directory, and from the
    // repo root it finds neither. Going through the workspace script keeps the
    // two from drifting apart.
    command:
      'npm run build --workspace=@b1/web && npm run preview --workspace=@b1/web -- --port 4173 --strictPort',
    cwd: '.',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
