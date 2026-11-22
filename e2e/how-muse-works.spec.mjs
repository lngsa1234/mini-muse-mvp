// Acceptance tests: How Muse works (docs/specs/how-muse-works.md).
import { test, expect } from "@playwright/test";
import { open, goTo, audit, pendingSend } from "./helpers.mjs";

test("how-muse-works AC1: the loop highlights the phase Muse is in", async ({ page }) => {
  await open(page, { ...pendingSend, state: { prefs: { learn: true } } });
  await page.locator("#box").fill("email maya");
  await page.locator("#box").press("Enter");
  await expect(page.locator('#loop li[data-p="waiting"]')).toHaveClass(/\bon\b/);
  await expect(page.locator("#loop li.on")).toHaveCount(1);
  await page.locator(".approve").getByRole("button", { name: "Don't allow" }).click();
  await expect(page.locator("#loop li.on")).toHaveCount(0);
});

test("how-muse-works AC2: a connected service's tools are listed after the core tools", async ({ page }) => {
  await open(page, { google: true, state: { prefs: { learn: true } } });
  await expect.poll(async () => (await page.locator("#toolNow code").allTextContents()).includes("mail_search")).toBe(true);
  const all = await page.locator("#toolNow code").allTextContents();
  const firstConn = all.indexOf("mail_search");
  expect(firstConn).toBeGreaterThan(all.indexOf("remember"));
  expect(all.slice(firstConn).every(n => /^(mail|calendar|contacts)_/.test(n))).toBe(true);
});

test("how-muse-works AC3: Settings → Activity shows only the latest 150 entries", async ({ page }) => {
  await open(page, { state: { audit: Array.from({ length: 160 }, (_, i) => audit("remember", "muse", i)) } });
  await goTo(page, "settings");
  await expect(page.locator("#audit li")).toHaveCount(150);
  await expect(page.locator("#audit li").first()).toContainText("in 0");     // newest first
  await expect(page.locator("#audit li").last()).toContainText("in 149");   // the 10 oldest are gone
});

test("how-muse-works AC4: an entry the user did is labelled as done by you", async ({ page }) => {
  await open(page, { state: { audit: [audit("delete_goal", "you", 0), audit("remember", "muse", 1)] } });
  await goTo(page, "settings");
  await expect(page.locator("#audit li").nth(0).locator(".top span").first()).toHaveText("you · delete_goal");
  await expect(page.locator("#audit li").nth(1).locator(".top span").first()).toHaveText("remember");
});

test("how-muse-works AC5: the panel shows Muse's six latest tool calls, not the user's", async ({ page }) => {
  const entries = [audit("forget", "you", 0), ...Array.from({ length: 8 }, (_, i) => audit("tool_" + i, "muse", i + 1))];
  await open(page, { state: { audit: entries, prefs: { learn: true } } });
  const rows = page.locator("#hoodRecent li");
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText("tool_0");
  await expect(page.locator("#hoodRecent")).not.toContainText("you ·");
});

test("how-muse-works AC6: with no activity yet, it explains every tool call will show up here", async ({ page }) => {
  await open(page);
  await goTo(page, "settings");
  await expect(page.locator("#audit")).toContainText("Nothing yet. Every tool Muse uses shows up here");
});
