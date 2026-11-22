// Acceptance tests: Goals (docs/specs/goals.md), browser criteria.
import { test, expect } from "@playwright/test";
import { open, goTo, seen } from "./helpers.mjs";

test("goals AC1: submitting a goal asks Muse to plan it with every step left as todo", async ({ page }) => {
  await open(page, { script: [{ text: "Here's a plan." }] });
  await goTo(page, "goals");
  await page.locator("#goalBox").fill("Run a 10k by March");
  await page.locator("#goalBox").press("Enter");
  await expect(page.locator(".msg.assistant .bubble")).toHaveText("Here's a plan.");
  const sent = (await seen(page)).turns[0].messages.at(-1).content;
  expect(sent).toContain("New goal: Run a 10k by March. Make a plan for it.");
  expect(sent).toContain("Leave every step as todo");
});
