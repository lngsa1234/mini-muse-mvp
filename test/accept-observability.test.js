// Acceptance tests: Observability (docs/specs/observability.md), one per criterion.
// The trace store is replaced with an in-memory fake.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const written = [];
mock.module("../server/trace-store.js", { namedExports: {
  writeBatch: async b => { written.push(b); return { traces: b.traces.length, spans: b.spans.length, logs: b.logs.length }; },
  upsertTrace: async () => {}, listTraces: async () => [], listLogs: async () => [],
  getTrace: async () => ({ trace: null, spans: [], logs: [] })
} });
const { handleIngest, handleGetTrace } = await import("../server/trace.js");

test("observability AC1: with OBS_ENABLED off, nothing is written and the reply says disabled", async () => {
  written.length = 0;
  const out = await handleIngest("u1", { traces: [{ id: "t1" }] }, { OBS_ENABLED: "false" });
  assert.equal(out.status, 202);
  assert.equal(out.json.disabled, true);
  assert.equal(written.length, 0);
});

test("observability AC2: ingested traces carry the server's user id, not the browser's", async () => {
  written.length = 0;
  await handleIngest("u1", { traces: [{ id: "t1", user_id: "someone-else" }], logs: [{ msg: "hi", user_id: "someone-else" }] }, {});
  assert.equal(written[0].traces[0].user_id, "u1");
  assert.equal(written[0].logs[0].user_id, "u1");
});

test("observability AC3: a post with no traces, spans or logs returns 400", async () => {
  written.length = 0;
  const out = await handleIngest("u1", {}, {});
  assert.equal(out.status, 400);
  assert.equal(written.length, 0);
});

test("observability AC8: an unknown trace id returns 404", async () => {
  const out = await handleGetTrace("t-missing");
  assert.deepEqual([out.status, out.json.error], [404, "trace not found"]);
});
