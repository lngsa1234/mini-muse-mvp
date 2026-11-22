// Acceptance tests: Connectors (docs/specs/connectors.md), one per criterion.
// Google is faked; the model is scripted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, call, waitForEvent, U } from "../testkit/agent.js";
import { fakeRes } from "../testkit/http.js";
import { answerWait } from "../server/agent/runtime.js";
import connectors from "../server/agent/tools/connectors.js";
import { handlers, handleGoogleRoute } from "../server/google-route.js";
import * as google from "../server/google.js";

test("connectors AC6: calendar_add shows an approval card with the event and time before adding", async () => {
  const added = [];
  const g = async (action, body) => { if (action === "calendar/add") added.push(body); return { id: "e1" }; };
  const t = setup({ google: g, script: [{ tools: [call("calendar_add", { title: "Coffee with Maya", start: "2026-11-24T15:00:00Z" })] }, { text: "Added." }] });
  // Permission is "Ask me first" (the default).
  await t.store.patchState(U, { connectors: { calendar: { writes: "ask" } } });
  const running = t.turn({ text: "add coffee with Maya Tuesday 10am" });
  const msg = await waitForEvent(t.events, "msg", 3);
  const act = msg.acts.find(a => a.approval === "pending");
  assert.equal(act.card.heading, "Muse wants to add this to Google Calendar. Allow it?");
  assert.deepEqual(act.card.rows.map(r => r[0]), ["Event", "When"]);
  assert.match(act.card.rows[1][1], /Nov 24/);
  assert.equal(added.length, 0, "nothing is added before the answer");
  await answerWait(t.store, U, act.id, { answer: true });
  await running;
  assert.equal(added.length, 1);
});

test("connectors AC7: contacts_lookup with a name that matches nobody returns 'No contact found.'", async () => {
  const tool = connectors.tools.find(t => t.name === "contacts_lookup");
  const ctx = { data: { contacts: [
    { name: "Maya Chen", email: "maya@example.com", note: "Learning circle member", example: true },
    { name: "Sam Ortiz", email: "sam@example.com", note: "Learning circle member", example: true }
  ] } };
  assert.equal(await tool.run({ name: "Priya Raman" }, ctx, { act: () => {} }), "No contact found.");
});

test("connectors AC8: POST /api/google/mail/search is handled by the Google module", async () => {
  assert.equal(typeof handlers["mail/search"], "function");
  const res = fakeRes();
  await handleGoogleRoute("mail/search", { method: "POST", headers: {}, body: { query: "" } }, res);
  // With no Google sign-in the module answers itself; an unrouted action would be 404 "not found".
  assert.notEqual(res.statusCode, 404);
  assert.ok(res.statusCode >= 400, "refuses without a Google sign-in");
  assert.equal(typeof google.googleMailSearch, "function");
});
