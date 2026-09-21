import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // Some sandboxes ship a pinned Chromium revision at a fixed path
    // rather than the one `playwright install` (CI, and most local
    // setups) provisions — only override when that's actually where
    // this environment put it.
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? undefined,
    },
  },
  webServer: {
    command: "pnpm --filter @cim/web dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
