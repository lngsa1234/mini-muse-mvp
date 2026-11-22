// Acceptance tests: Ideas (docs/specs/ideas.md), browser criteria.
import { test, expect } from "@playwright/test";
import { open, goTo, seen } from "./helpers.mjs";

const idea = (id, title, status) => ({ id, title, why: "Because.", kind: "Get ahead", basedOn: ["memory"], action: title, status, by: "muse", t: Date.now() });
const repoIdea = async (page, id) => (await seen(page)) && (await (await page.request.get("/api/ideas")).json()).ideas.find(i => i.id === id);
const settled = page => expect(page.locator("#genIdeas")).toHaveText("Update with Muse");

test("ideas AC5: with no new ideas, rule-based starter ideas show under Starter ideas", async ({ page }) => {
  await open(page, { json: [[]] });
  await goTo(page, "ideas");
  await settled(page);
  await expect(page.locator("#ideaList h3.label").first()).toContainText("Starter ideas");
  await expect(page.locator("#ideaList .tag.ex").first()).toHaveText("starter");
});

test("ideas AC6: Update with Muse adds new ideas under New from Muse", async ({ page }) => {
  const fresh = [{ title: "Invite Maya to coffee", why: "You meet Fridays.", kind: "Get ahead", based_on: ["memory"], action: "Draft an invite" }];
  await open(page, { json: [[], fresh] });   // the first reply is the automatic refresh on opening the page
  await goTo(page, "ideas");
  await settled(page);
  await page.locator("#genIdeas").click();
  await expect(page.locator("#ideaList h3.label").first()).toContainText("New from Muse");
  await expect(page.locator("#ideaList article.sugg h3")).toContainText(["Invite Maya to coffee"]);
  const stored = (await (await page.request.get("/api/ideas")).json()).ideas;
  expect(stored.map(i => [i.title, i.status])).toEqual([["Invite Maya to coffee", "new"]]);
});

test("ideas AC7: Save sets a stored idea to saved and moves it to the Saved group", async ({ page }) => {
  await open(page, { ideas: [idea("i1", "Plan a weekend hike", "new")] });
  await goTo(page, "ideas");
  await page.locator('[data-keep-idea="i1"]').click();
  await expect(page.locator("#ideaList section", { hasText: "Saved" }).locator("article h3")).toHaveText(["Plan a weekend hike"]);
  expect((await repoIdea(page, "i1")).status).toBe("saved");
});

test("ideas AC8: Not for me dismisses a stored idea and removes its card", async ({ page }) => {
  await open(page, { ideas: [idea("i1", "Plan a weekend hike", "new")] });
  await goTo(page, "ideas");
  await page.locator('[data-skip-idea="i1"]').click();
  await expect(page.locator("#ideaList")).not.toContainText("Plan a weekend hike");
  expect((await repoIdea(page, "i1")).status).toBe("dismissed");
});

test("ideas AC9: Do it marks the idea done and sends Muse a message to carry it out", async ({ page }) => {
  await open(page, { ideas: [idea("i1", "Plan a weekend hike", "saved")], script: [{ text: "On it." }] });
  await goTo(page, "ideas");
  await page.locator('[data-do-idea="i1"]').click();
  await expect(page.locator(".msg.user .bubble")).toContainText('Do this idea from my Ideas page: "Plan a weekend hike"');
  await expect(page.locator(".msg.assistant .bubble")).toHaveText("On it.");
  expect((await repoIdea(page, "i1")).status).toBe("done");
});
