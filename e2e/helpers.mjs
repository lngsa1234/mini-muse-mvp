// Shared helpers for the browser tests (see testkit/browser-server.mjs).
import { expect } from "@playwright/test";

// Reset the server's in-memory world, then load the app and wait for it to boot.
export async function open(page, seed = {}, { ready = true } = {}) {
  const res = await page.request.post("/__test/reset", { data: seed });
  if (!res.ok()) throw new Error("reset failed");
  await page.goto("/");
  if (ready) await expect(page.locator("#box")).toBeEnabled();
}
export const seen = async page => (await page.request.get("/__test/seen")).json();
export const serverState = async page => (await (await page.request.get("/api/state")).json());
export const call = (name, input, id = "c_" + name) => ({ id, name, input });
export const goTo = (page, view) => page.locator(`[data-go="${view}"]`).first().click();
export const audit = (tool, by = "muse", i = 0) => ({ t: Date.now() - i * 1000, tool, input: "in " + i, result: "out " + i, by });
// A turn that stops on an approval card (Gmail send), so Muse stays busy until answered.
export const pendingSend = { google: true, script: [{ tools: [call("mail_send", { to: "maya@example.com", subject: "Hi", body: "See you" })] }, { text: "Done." }] };
