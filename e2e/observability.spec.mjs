// Acceptance tests: Observability (docs/specs/observability.md), browser criteria.
import { test, expect } from "@playwright/test";
import { open, goTo } from "./helpers.mjs";

const trace = (traceId, spanNames) => ({
  trace: { traceId, name: "agent.turn", rootKind: "turn", status: "ok", startedAt: Date.now(), durationMs: 1200 },
  spans: spanNames.map((name, i) => ({ spanId: traceId + i, parentSpanId: i ? traceId + "0" : null, name, kind: "internal", status: "ok", startedAt: Date.now() + i, durationMs: 100, attributes: {} })),
  logs: []
});

test("observability AC6: an open trace's header says whether any tool ran", async ({ page }) => {
  await open(page, { traces: [trace("t1", ["agent.turn", "openai.chat", "tool.remember"]), trace("t2", ["agent.turn", "openai.chat"])] });
  await goTo(page, "observability");
  await page.locator('[data-obs-trace="t1"]').click();
  await expect(page.locator(".obs-flags")).toContainText("3 spans · ran tools");
  await page.locator('[data-obs-trace="t2"]').click();
  await expect(page.locator(".obs-flags")).toContainText("2 spans · no tool calls");
});

test("observability AC7: with no traces yet, it says to send a chat message and refresh", async ({ page }) => {
  await open(page);
  await goTo(page, "observability");
  await expect(page.locator("#obsList")).toHaveText("No traces yet. Send a chat message, then refresh.");
});
