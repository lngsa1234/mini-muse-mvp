// Acceptance tests: Agent chat (docs/specs/agent-chat.md), browser criteria.
import { test, expect } from "@playwright/test";
import { open, seen, call } from "./helpers.mjs";

test("agent-chat AC1: Enter sends the message, Shift+Enter adds a new line", async ({ page }) => {
  await open(page, { script: [{ text: "Hi Ling!" }] });
  const box = page.locator("#box");
  await box.fill("first line");
  await box.press("Shift+Enter");
  await expect(box).toHaveValue("first line\n");
  expect((await seen(page)).turns.length).toBe(0);
  await box.pressSequentially("second line");
  await box.press("Enter");
  await expect(page.locator(".msg.user .bubble")).toContainText("second line");
  await expect(page.locator(".msg.assistant .bubble")).toHaveText("Hi Ling!");
  await expect(box).toHaveValue("");
});

test("agent-chat AC4: when the server has no model key, chat is disabled with a message", async ({ page }) => {
  await open(page, { llmError: { code: "sampling_disabled", status: 503 } });
  await page.locator("#box").fill("hello");
  await page.locator("#box").press("Enter");
  await expect(page.getByText("The assistant isn't available on this account").first()).toBeVisible();
  await expect(page.locator("#box")).toBeDisabled();
});

test("agent-chat AC6: a provider rate limit shows the usage-limit message", async ({ page }) => {
  await open(page, { llmError: { code: "rate_limited", status: 429 } });
  await page.locator("#box").fill("hello");
  await page.locator("#box").press("Enter");
  await expect(page.locator(".msg.assistant .err")).toHaveText("Muse hit a usage limit. Wait a minute, then send again.");
});

test("agent-chat AC7: an empty chat shows a welcome with example chips; a chip sends its text", async ({ page }) => {
  await open(page, { script: [{ text: "Noted." }] });
  await expect(page.locator(".welcome h2")).toHaveText("Tell Muse what you want done");
  const chips = page.locator(".welcome .chip");
  await expect(chips).toHaveCount(5);
  const text = await chips.first().textContent();
  await chips.first().click();
  await expect(page.locator(".msg.user .bubble")).toHaveText(text);
  await expect(page.locator(".msg.assistant .bubble")).toHaveText("Noted.");
});

test("agent-chat AC8: an action that needs approval shows a card with heading, details and allow/decline buttons", async ({ page }) => {
  await open(page, { google: true, script: [{ tools: [call("mail_send", { to: "maya@example.com", subject: "Lunch", body: "Free Friday?" })] }, { text: "Not sent." }] });
  await page.locator("#box").fill("email maya about lunch");
  await page.locator("#box").press("Enter");
  const card = page.locator(".approve");
  await expect(card.locator("h4")).toHaveText("Muse wants to send this Gmail message. Allow it?");
  await expect(card.locator("dt")).toHaveText(["To", "Subject"]);
  await expect(card.locator("dd")).toHaveText(["maya@example.com", "Lunch"]);
  await expect(card.getByRole("button", { name: "Send email" })).toBeVisible();
  await card.getByRole("button", { name: "Don't allow" }).click();
  await expect(page.locator(".msg.assistant .bubble").last()).toHaveText("Not sent.");
});
