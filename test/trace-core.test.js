// Observability core unit tests: `npm test` (no network, no DB needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newTraceId, newSpanId, formatTraceparent, parseTraceparent,
  capContent, CONTENT_CAP, makeCollector, startSpan, addLog,
  traceSummaryFromSpan, setActiveSpanHook, traceChild, SPAN_KIND, STATUS
} from "../server/trace-core.js";

test("ids: W3C Trace Context sizes, lowercase hex", () => {
  assert.match(newTraceId(), /^[0-9a-f]{32}$/);
  assert.match(newSpanId(), /^[0-9a-f]{16}$/);
});

test("traceparent: round-trips trace/span/sampled", () => {
  const traceId = newTraceId();
  const spanId = newSpanId();
  const header = formatTraceparent(traceId, spanId, true);
  assert.equal(header, `00-${traceId}-${spanId}-01`);
  const parsed = parseTraceparent(header);
  assert.deepEqual(parsed, { traceId, spanId, sampled: true });
  // unsampled flag
  assert.equal(parseTraceparent(formatTraceparent(traceId, spanId, false)).sampled, false);
});

test("traceparent: rejects malformed headers and all-zero ids", () => {
  assert.equal(parseTraceparent(""), null);
  assert.equal(parseTraceparent("garbage"), null);
  assert.equal(parseTraceparent("00-tooshort-x-01"), null);
  assert.equal(parseTraceparent("01-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01"), null); // bad version
  assert.equal(parseTraceparent("00-" + "0".repeat(32) + "-" + "b".repeat(16) + "-01"), null); // zero trace
  assert.equal(formatTraceparent("short", "b".repeat(16)), null);
});

test("capContent: truncates past the cap with a marker", () => {
  assert.equal(capContent("hi"), "hi");
  const big = "x".repeat(CONTENT_CAP + 50);
  const out = capContent(big);
  assert.ok(out.length < big.length);
  assert.match(out, /truncated, \d+ chars\)$/);
  // custom cap
  assert.equal(capContent("abcdef", { cap: 3 }), "abc… (truncated, 6 chars)");
});

test("capContent: redacts to a size hint when capture is off", () => {
  const out = capContent("secret prompt text", { capture: false });
  assert.deepEqual(out, { redacted: true, length: "secret prompt text".length });
  // objects are stringified before measuring
  const obj = capContent({ a: 1 }, { capture: false });
  assert.equal(obj.redacted, true);
  assert.equal(obj.length, JSON.stringify({ a: 1 }).length);
});

test("spans: end records duration/status and collects; child inherits trace", () => {
  const collector = makeCollector();
  const root = startSpan(collector, "agent.turn", { kind: SPAN_KIND.SERVER });
  const child = root.child("db.query", { kind: SPAN_KIND.DB });
  assert.equal(child.traceId, root.traceId);
  assert.equal(child.span.parent_span_id, root.id);
  child.set({ "db.row_count": 3 }).end();
  root.end();
  assert.equal(collector.spans.length, 2);
  assert.equal(child.span.status, STATUS.OK);
  assert.equal(typeof child.span.duration_ms, "number");
  assert.ok(child.span.duration_ms >= 0);
  assert.equal(child.span.attributes["db.row_count"], 3);
});

test("spans: end is idempotent; fail marks error with message", () => {
  const collector = makeCollector();
  const span = startSpan(collector, "tool.x", { kind: SPAN_KIND.TOOL });
  span.fail(new Error("boom"));
  span.end(STATUS.OK); // second call ignored
  assert.equal(collector.spans.length, 1);
  assert.equal(span.span.status, STATUS.ERROR);
  assert.equal(span.span.status_message, "boom");
});

test("addLog: stamps trace/user and normalizes body", () => {
  const collector = makeCollector({ userId: "u1" });
  addLog(collector, "warn", { note: "x" });
  const log = collector.logs[0];
  assert.equal(log.severity, "warn");
  assert.equal(log.user_id, "u1");
  assert.equal(log.trace_id, collector.traceId);
  assert.equal(log.body, JSON.stringify({ note: "x" }));
});

test("traceSummaryFromSpan: carries rootKind + timing", () => {
  const collector = makeCollector();
  const root = startSpan(collector, "agent.turn", { kind: SPAN_KIND.SERVER });
  root.end();
  const summary = traceSummaryFromSpan(root.span, { rootKind: "agent_turn", userId: "u1" });
  assert.equal(summary.trace_id, root.traceId);
  assert.equal(summary.root_kind, "agent_turn");
  assert.equal(summary.user_id, "u1");
  assert.equal(summary.status, STATUS.OK);
});

test("ambient span hook: no-op by default, delegates once registered", () => {
  assert.equal(traceChild("x"), null); // not registered
  const calls = [];
  setActiveSpanHook((name, opts) => { calls.push([name, opts]); return "stub"; });
  assert.equal(traceChild("db.query", { kind: "db" }), "stub");
  assert.deepEqual(calls[0], ["db.query", { kind: "db" }]);
  setActiveSpanHook(null); // restore for other tests
  assert.equal(traceChild("x"), null);
});
