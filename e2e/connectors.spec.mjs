// Acceptance tests: Connectors (docs/specs/connectors.md), browser criteria.
import { test, expect } from "@playwright/test";
import { open, goTo, seen } from "./helpers.mjs";

const card = (page, name) => page.locator("article.conn", { has: page.locator("h3", { hasText: new RegExp(`^${name}$`) }) });

test("connectors AC1: Continue with Google in the consent panel goes to /api/google/authorize", async ({ page }) => {
  await open(page);
  await goTo(page, "connectors");
  await card(page, "Gmail").getByRole("button", { name: "Connect" }).click();
  await expect(card(page, "Gmail").locator(".consent")).toContainText("Mini Muse wants access to Gmail");
  await card(page, "Gmail").getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/api\/google\/authorize$/);
});

test("connectors AC2: with Gmail connected, Allow is disabled because sending email always needs approval", async ({ page }) => {
  await open(page, { google: true });
  await goTo(page, "connectors");
  const gmail = card(page, "Gmail");
  await expect(gmail.getByRole("button", { name: "Allow" })).toBeDisabled();
  await expect(gmail).toContainText("Sending email always needs your approval.");
});

test("connectors AC3: when Google reports connected, Gmail and Calendar are both on", async ({ page }) => {
  await open(page, { google: true });
  await goTo(page, "connectors");
  await expect(card(page, "Gmail").locator(".pill")).toHaveText("Connected");
  await expect(card(page, "Google Calendar").locator(".pill")).toHaveText("Connected");
});

test("connectors AC4: Disconnect Google turns off Gmail and Calendar and audits it", async ({ page }) => {
  await open(page, { google: true });
  await goTo(page, "connectors");
  await card(page, "Gmail").getByRole("button", { name: "Disconnect Google" }).click();
  await expect(card(page, "Gmail").locator(".pill")).toHaveText("Not connected");
  await expect(card(page, "Google Calendar").locator(".pill")).toHaveText("Not connected");
  expect((await seen(page)).google).toContain("disconnect");
  await goTo(page, "settings");
  await expect(page.locator("#audit li").first()).toContainText("you · disconnect");
});
