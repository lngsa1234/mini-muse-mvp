// Acceptance tests: Daily check-in (docs/specs/daily-check-in.md), browser criteria.
// The page clock is controlled, so the five-minute timer and 9am start are tested directly.
import { test, expect } from "@playwright/test";
import { open, goTo, seen, pendingSend } from "./helpers.mjs";

const goal = { id: "g1", goal: "Land 3 interviews", steps: ["Find openings", "Tailor résumé", "Apply"].map(text => ({ text, status: "todo" })), applications: [], t: 1 };
const day = (d, h) => new Date(2026, 10, d, h, 0, 0);
const ymd = d => d.toLocaleDateString("en-CA");
const checkins = async page => (await seen(page)).turns.filter(t => /scheduled background check-in/.test(t.messages.at(-1)?.content || "")).length;

test("daily-check-in AC1: the check-in button runs a check-in turn", async ({ page }) => {
  await open(page, { goals: [goal], script: [{ text: "Brief: nothing new." }] });
  await goTo(page, "goals");
  await page.locator("#checkinBtn").click();
  await expect(page.locator(".checkin")).toContainText("Muse worked on your goals");
  await expect(page.locator(".msg.assistant .bubble")).toHaveText("Brief: nothing new.");
  expect(await checkins(page)).toBe(1);
});

test("daily-check-in AC2: with a check-in already run today, the timer doesn't run another", async ({ page }) => {
  await page.clock.install({ time: day(23, 10) });
  await open(page, { goals: [goal], script: [{ text: "Brief." }], state: { prefs: { dailyCheckin: true, lastCheckin: ymd(day(23, 10)) } } });
  await page.clock.runFor(6 * 60_000);
  await page.waitForTimeout(500);         // real time, for any request the timer started
  expect(await checkins(page)).toBe(0);
});

test("daily-check-in AC3: before 9am the check-in waits, then runs once 9am has passed", async ({ page }) => {
  await page.clock.install({ time: day(23, 8) });
  await open(page, { goals: [goal], script: [{ text: "Brief." }], state: { prefs: { dailyCheckin: true, lastCheckin: ymd(day(22, 10)) } } });
  await page.clock.runFor(30 * 60_000);
  await page.waitForTimeout(500);
  expect(await checkins(page)).toBe(0);
  await page.clock.runFor(35 * 60_000);   // now past 9:00; the next five-minute tick runs it
  await expect.poll(() => checkins(page)).toBe(1);
});

test("daily-check-in AC4: no check-in runs while Muse is busy or when there are no goals", async ({ page }) => {
  await page.clock.install({ time: day(23, 10) });
  await open(page, { script: [{ text: "Brief." }], state: { prefs: { dailyCheckin: true, lastCheckin: ymd(day(22, 10)) } } });
  await page.clock.runFor(6 * 60_000);
  await page.waitForTimeout(500);
  expect(await checkins(page)).toBe(0);   // no goals

  await open(page, { ...pendingSend, goals: [goal], state: { prefs: { dailyCheckin: true, lastCheckin: ymd(day(22, 10)) } } });
  await page.locator("#box").fill("email maya");
  await page.locator("#box").press("Enter");
  await expect(page.locator(".approve")).toBeVisible();
  await page.clock.runFor(6 * 60_000);
  await page.waitForTimeout(500);
  expect(await checkins(page)).toBe(0);   // busy with the approval
});
