// Acceptance tests: Approvals (docs/specs/tool-approvals.md), server criteria.
// Google is faked; the model is scripted; the store is in memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, call, waitForEvent, U } from "../testkit/agent.js";
import { answerWait } from "../server/agent/runtime.js";
import { dispatchAgent } from "../server/agent/http.js";

const mailScript = (after = "Done.") => [{ tools: [call("mail_send", { to: "maya@example.com", subject: "Hi", body: "See you" })] }, { text: after }];
const recorder = () => { const sent = []; return { sent, google: async (action, body) => { if (action === "mail/send") sent.push(body); return { id: "x1" }; } }; };

test("approvals AC1: while a card waits, the chat says Muse is waiting for approval", async () => {
  const { google } = recorder();
  const t = setup({ google, script: mailScript() });
  const running = t.turn({ text: "email maya" });
  const msg = await waitForEvent(t.events, "msg", 3);
  assert.equal(msg.status, "Waiting for your approval…");
  assert.ok(t.events.some(([n, d]) => n === "phase" && d === "waiting"));
  await answerWait(t.store, U, msg.acts.find(a => a.approval === "pending").id, { answer: false });
  await running;
});

test("approvals AC3: declining a card continues the tool with a no", async () => {
  const { sent, google } = recorder();
  const t = setup({ google, script: mailScript("Okay, I won't send it.") });
  const running = t.turn({ text: "email maya" });
  const msg = await waitForEvent(t.events, "msg", 3);
  const card = msg.acts.find(a => a.approval === "pending");
  await answerWait(t.store, U, card.id, { answer: false });
  const done = await running;
  assert.equal(sent.length, 0);
  assert.equal(done.acts.find(a => a.id === card.id).approval, "declined");
  assert.match(t.llm.seen[1].messages.find(m => m.role === "tool").content, /The user declined/);
});

test("approvals AC5: approved, declined and unanswered cards are all written to the audit", async () => {
  const outcomes = [];
  for (const answer of [true, false, null]) {
    const { google } = recorder();
    const t = setup({ google, script: mailScript() });
    if (answer === null) t.deps.timeouts.approval = 60;
    const running = t.turn({ text: "email maya" });
    if (answer !== null) {
      const msg = await waitForEvent(t.events, "msg", 3);
      await answerWait(t.store, U, msg.acts.find(a => a.approval === "pending").id, { answer });
    }
    await running;
    const entry = (await t.store.getState(U)).audit.find(e => e.tool === "approval");
    assert.equal(entry.by, "you");
    outcomes.push(entry.result);
  }
  assert.deepEqual(outcomes, ["approved", "declined", "expired"]);
});

test("approvals AC6: a card still open when the turn runs out of time can be answered, and Muse carries on", async () => {
  const { sent, google } = recorder();
  const t = setup({ google, script: [...mailScript().slice(0, 1), { text: "Sent it to Maya." }] });
  t.deps.timeouts.approval = 2000; t.deps.timeouts.turn = 80;
  const paused = await t.turn({ text: "email maya" });
  const card = paused.acts.find(a => a.approval === "pending");
  assert.ok(card?.parked, "the card stays open after the turn ends");
  assert.match(paused.text, /waiting for your answer on the card above/);
  assert.equal(sent.length, 0);

  const answered = await dispatchAgent(t.store, { method: "POST", action: "answer", userId: U, body: { waitId: card.id, answer: true } });
  assert.deepEqual(answered, { status: 200, json: { ok: true, resume: card.id } });
  const followUp = await t.turn({ resume: card.id });
  assert.equal(sent.length, 1);
  assert.equal(followUp.text, "Sent it to Maya.");
  const original = (await t.store.listChat(U)).find(m => m.id === paused.id);
  assert.equal(original.acts.find(a => a.id === card.id).approval, "approved");
  // The follow-up turn tells Muse the outcome, without a new user message.
  assert.match(t.llm.seen[1].messages.at(-1).content, /The user approved your earlier request/);
  assert.equal((await t.store.listChat(U)).filter(m => m.role === "user").length, 1);
});

test("approvals AC7: answering a paused card after its time has run out does nothing", async () => {
  const { sent, google } = recorder();
  const t = setup({ google, script: mailScript() });
  t.deps.timeouts.approval = 120; t.deps.timeouts.turn = 30;
  const paused = await t.turn({ text: "email maya" });
  const card = paused.acts.find(a => a.approval === "pending");
  await new Promise(r => setTimeout(r, 150));
  const answered = await dispatchAgent(t.store, { method: "POST", action: "answer", userId: U, body: { waitId: card.id, answer: true } });
  assert.equal(answered.status, 409);
  await t.turn({ resume: card.id });
  assert.equal(sent.length, 0);
  assert.equal(t.events.filter(([n, d]) => n === "error" && d.code === "resume_gone").length, 1);
});
