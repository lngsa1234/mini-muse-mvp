// Acceptance tests: Agent chat (docs/specs/agent-chat.md), server criteria.
// The model is scripted; the store and repo are in memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, waitForEvent, U } from "../testkit/agent.js";
import { answerWait } from "../server/agent/runtime.js";

test("agent-chat AC9: an apply request removes mail_search and mail_send from the turn's tools", async () => {
  const t = setup({ google: async () => ({ messages: [] }), script: [{ text: "I filled what I could." }] });
  const running = t.turn({ text: "apply for this job for me" });
  // The runtime reads the open application page first through the browser bridge.
  for (let n = 1; n <= 3; n++) {
    const req = await waitForEvent(t.events, "client_tool", n);
    await answerWait(t.store, U, req.waitId, { result: req.name === "browser_fields" ? { fields: [] } : { title: "Apply", url: "https://jobs.example/apply", text: "Form" } });
    if (req.name === "browser_fields") break;
  }
  await running;
  const offered = t.llm.seen[0].tools.map(x => x.function.name);
  assert.ok(!offered.includes("mail_search"));
  assert.ok(!offered.includes("mail_send"));

  // A normal turn with Google connected still offers them.
  const other = setup({ google: async () => ({ messages: [] }), script: [{ text: "ok" }] });
  await other.turn({ text: "what's new" });
  assert.ok(other.llm.seen[0].tools.some(x => x.function.name === "mail_send"));
});

test("agent-chat AC10: a reply stopped by the token limit says it was cut short", async () => {
  const t = setup({ script: [{ text: "Here is the first part of a very long", stop: "length" }] });
  const msg = await t.turn({ text: "write me everything" });
  assert.equal(msg.error, "The reply was cut short. Ask for less at once.");
  assert.match(msg.text, /first part/);
});
