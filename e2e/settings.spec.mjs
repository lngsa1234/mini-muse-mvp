// Acceptance tests: Settings (docs/specs/settings.md).
import { test, expect } from "@playwright/test";
import { open, goTo, serverState, pendingSend } from "./helpers.mjs";

test("settings AC1: with no style chosen, Fast is selected", async ({ page }) => {
  await open(page);
  await goTo(page, "settings");
  await expect(page.locator("#mFast")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#mSmart")).toHaveAttribute("aria-pressed", "false");
});

test("settings AC2: choosing Thorough says replies can take up to a minute", async ({ page }) => {
  await open(page);
  await goTo(page, "settings");
  await page.locator("#mSmart").click();
  await expect(page.locator("#mSmart")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#modeNote")).toContainText("Replies can take up to a minute.");
});

test("settings AC3: the web search switch turns web search off and saves it", async ({ page }) => {
  await open(page);
  await goTo(page, "settings");
  const sw = page.locator("#webSearch");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect.poll(async () => (await serverState(page)).state.prefs?.webSearch).toBe(false);
});

test("settings AC4: on a phone, turning How Muse works off returns to Chat", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  await page.locator("#learnBtn").click();
  await expect(page.locator("#panes")).toHaveAttribute("data-mobile", "hood");
  await page.locator("#learnBtn").click();
  await expect(page.locator("#panes")).toHaveAttribute("data-mobile", "main");
  await expect(page.locator("#main")).toHaveAttribute("data-main", "chat");
});

test("settings AC5: Erase everything asks for confirmation before erasing", async ({ page }) => {
  await open(page, { state: { memory: [{ id: "f1", fact: "Lives in Detroit", t: 1 }] } });
  await goTo(page, "settings");
  await page.locator("#resetBtn").click();
  await expect(page.locator("#resetWrap")).toContainText("Are you sure?");
  await expect(page.locator("#memList")).toContainText("Lives in Detroit");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#resetBtn")).toBeVisible();
  expect((await serverState(page)).state.memory.length).toBe(1);
});

test("settings AC6: confirming the erase stops a running turn and erases chat, memory and settings, keeping preferences", async ({ page }) => {
  await open(page, { ...pendingSend, state: { memory: [{ id: "f1", fact: "Lives in Detroit", t: 1 }], prefs: { mode: "default", webSearch: false } } });
  await page.locator("#box").fill("email maya");
  await page.locator("#box").press("Enter");
  await expect(page.locator(".approve")).toBeVisible();
  await goTo(page, "settings");
  await page.locator("#resetBtn").click();
  await page.getByRole("button", { name: "Yes, erase it all" }).click();
  await expect(page.locator("#stop")).toBeHidden();
  await expect.poll(async () => { const s = await serverState(page); return [s.chat.length, (s.state.memory || []).length]; }).toEqual([0, 0]);
  const s = await serverState(page);
  expect(s.state.prefs).toMatchObject({ mode: "default", webSearch: false });
  await expect(page.locator("#memList")).toContainText("Muse doesn't know anything about you yet");
});
