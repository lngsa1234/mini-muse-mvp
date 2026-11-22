// Acceptance tests: Ideas (docs/specs/ideas.md), one per criterion.
// The database is replaced with an in-memory fake; the model is scripted.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, reset } from "../testkit/fake-db.js";
import { fakeRes } from "../testkit/http.js";

mock.module("../server/db.js", { namedExports: fakeDb });
mock.module("../server/trace-store.js", { namedExports: { writeBatch: async () => ({}), upsertTrace: async () => {}, listTraces: async () => [], getTrace: async () => ({}), listLogs: async () => [] } });
const ideas = await import("../server/ideas.js");
const { default: ideasIndex } = await import("../api/ideas/index.js");
// Imported after the mock so the agent runtime sees the fake database too.
const { setup, call, toolReply } = await import("../testkit/agent.js");

const U = "u1";

test("ideas AC1: posting an idea with a blank or missing title returns 400", async () => {
  reset();
  for (const body of [{ title: "   " }, {}]) {
    const out = await ideas.handleCreate(U, body);
    assert.deepEqual([out.status, out.json.error], [400, "title is required"]);
  }
});

test("ideas AC2: a valid idea is created with 201 and its title capped at 200 characters", async () => {
  reset();
  const out = await ideas.handleCreate(U, { title: "x".repeat(250), why: "because" });
  assert.equal(out.status, 201);
  assert.equal(out.json.idea.title.length, 200);
});

test("ideas AC3: PATCH or DELETE of an unknown idea returns 404", async () => {
  reset();
  const patch = await ideas.handleUpdate(U, "i-missing", { status: "done" });
  const del = await ideas.handleDelete(U, "i-missing");
  assert.deepEqual([patch.status, patch.json.error], [404, "no such idea"]);
  assert.deepEqual([del.status, del.json.error], [404, "no such idea"]);
});

test("ideas AC4: an unsupported method on /api/ideas returns 405", async () => {
  const res = fakeRes();
  await ideasIndex({ method: "PUT", url: "/api/ideas", headers: {}, body: {} }, res);
  assert.deepEqual([res.statusCode, res.body.error], [405, "method not allowed"]);
});

test("ideas AC10: save_idea with a title already on the page creates nothing", async () => {
  const t = setup({ repoSeed: { ideas: [{ id: "i1", title: "Message three PMs on LinkedIn", status: "saved" }] }, script: [{ tools: [call("save_idea", { title: "message three PMs on linkedin" })] }, { text: "It's already there." }] });
  await t.turn({ text: "idea: message three PMs on LinkedIn" });
  assert.equal(toolReply(t.llm), "Already on the Ideas page.");
  assert.equal(t.repo.data.ideas.length, 1);
});
