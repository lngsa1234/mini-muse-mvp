// Acceptance tests: Browser bridge (docs/specs/browser-bridge.md), browser criteria.
import { test, expect } from "@playwright/test";
import { open } from "./helpers.mjs";

test("browser-bridge AC1: without the extension, a browser tool fails saying the bridge did not respond", async ({ page }) => {
  await page.clock.install();
  await open(page);
  await page.evaluate(() => {
    window.__bridge = import("/js/features/browser/browser.js")
      .then(m => m.runBrowserTool("browser_snapshot", {}))
      .then(() => "resolved", e => e.message);
  });
  await page.clock.runFor(12_500);
  const out = await page.evaluate(() => window.__bridge);
  expect(out).toMatch(/^Mini Muse Browser Bridge did not respond: the Chrome extension isn't installed or enabled/);
});
