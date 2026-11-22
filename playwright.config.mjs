// Browser acceptance tests (e2e/*.spec.mjs) against testkit/browser-server.mjs:
// the real front-end and agent runtime with in-memory data and a scripted model.
import { defineConfig } from "@playwright/test";

const PORT = 4173;
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: false,
  workers: 1,             // one shared in-memory server, reset per test
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Locally, PW_CHANNEL=chrome uses an installed Chrome instead of Playwright's download.
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    viewport: { width: 1280, height: 800 }
  },
  webServer: { command: "node testkit/browser-server.mjs", url: `http://localhost:${PORT}/healthz`, reuseExistingServer: !process.env.CI, env: { PORT: String(PORT) } }
});
