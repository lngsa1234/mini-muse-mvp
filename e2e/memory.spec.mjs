// Acceptance tests: Memory (docs/specs/memory.md), browser criteria.
import { test, expect } from "@playwright/test";
import { open, goTo, serverState } from "./helpers.mjs";

test("memory AC5: deleting a fact in Settings removes it and audits it as by you", async ({ page }) => {
  await open(page, { state: { memory: [{ id: "f1", fact: "Lives in Detroit", t: 1 }, { id: "f2", fact: "Drinks tea", t: 2 }] } });
  await goTo(page, "settings");
  await page.locator('[data-del-mem="f1"]').click();
  await expect(page.locator("#memList")).not.toContainText("Lives in Detroit");
  await expect(page.locator("#memList")).toContainText("Drinks tea");
  await expect(page.locator("#audit li").first()).toContainText("you · forget");
  await expect.poll(async () => (await serverState(page)).state.memory.map(f => f.fact)).toEqual(["Drinks tea"]);
});

test("memory AC6: with nothing remembered, the list suggests telling Muse a preference in Chat", async ({ page }) => {
  await open(page);
  await goTo(page, "settings");
  await expect(page.locator("#memList")).toContainText("Muse doesn't know anything about you yet. Tell it a preference in Chat");
});
