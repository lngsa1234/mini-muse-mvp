// Acceptance tests: Memory (docs/specs/memory.md), server criteria.
// The model is scripted; memory lives in the in-memory store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, call, waitForEvent, toolReply, U } from "../testkit/agent.js";
import { answerWait } from "../server/agent/runtime.js";

const facts = list => list.map((fact, i) => ({ id: "f" + i, fact, t: i }));
const memoryOf = async t => (await t.store.getState(U)).memory.map(f => f.fact);

test("memory AC1: remembering a fact already saved, in different case, saves nothing new", async () => {
  const t = setup({ script: [{ tools: [call("remember", { fact: "i'm VEGETARIAN" })] }, { text: "ok" }] });
  await t.store.patchState(U, { memory: facts(["I'm vegetarian"]) });
  await t.turn({ text: "remember I'm vegetarian" });
  assert.equal(toolReply(t.llm), "Already remembered.");
  assert.deepEqual(await memoryOf(t), ["I'm vegetarian"]);
});

test("memory AC2: remember refuses an empty fact", async () => {
  const t = setup({ script: [{ tools: [call("remember", { fact: "  " })] }, { text: "ok" }] });
  await t.turn({ text: "remember" });
  assert.equal(toolReply(t.llm), "Error: fact is empty");
});

test("memory AC3: forgetting a keyword that matches several facts asks first, then removes and lists them", async () => {
  const saved = ["Drinks coffee black", "Coffee chat with Maya on Fridays", "Lives in Detroit"];
  for (const answer of [false, true]) {
    const t = setup({ script: [{ tools: [call("forget", { keyword: "coffee" })] }, { text: "ok" }] });
    await t.store.patchState(U, { memory: facts(saved) });
    const running = t.turn({ text: "forget the coffee stuff" });
    const msg = await waitForEvent(t.events, "msg", 3);
    const card = msg.acts.find(a => a.approval === "pending");
    assert.equal(card.card.heading, "Forget these 2 things Muse remembers?");
    assert.deepEqual(card.card.rows.map(r => r[1]), saved.slice(0, 2));
    await answerWait(t.store, U, card.id, { answer });
    await running;
    if (answer) {
      assert.deepEqual(await memoryOf(t), ["Lives in Detroit"]);
      assert.deepEqual(JSON.parse(toolReply(t.llm)).removed, saved.slice(0, 2));
    } else assert.deepEqual(await memoryOf(t), saved);
  }
  // A single match is forgotten without asking.
  const one = setup({ script: [{ tools: [call("forget", { keyword: "detroit" })] }, { text: "ok" }] });
  await one.store.patchState(U, { memory: facts(saved) });
  await one.turn({ text: "forget where I live" });
  assert.deepEqual(await memoryOf(one), saved.slice(0, 2));
});

test("memory AC4: forget with no matching fact removes nothing and says so", async () => {
  const t = setup({ script: [{ tools: [call("forget", { keyword: "cats" })] }, { text: "ok" }] });
  await t.store.patchState(U, { memory: facts(["Lives in Detroit"]) });
  await t.turn({ text: "forget cats" });
  assert.equal(toolReply(t.llm), "No memory matched 'cats'.");
  assert.deepEqual(await memoryOf(t), ["Lives in Detroit"]);
});
