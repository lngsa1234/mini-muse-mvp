/*
 * Observability core — runtime-neutral tracing primitives.
 * ---------------------------------------------------------------------------
 * No Node-only or browser-only APIs, so the same code runs in the Express
 * server, the Vercel Edge Function (api/llm.js), the Vercel Node functions and
 * the purge script. It knows nothing about storage; callers collect finished
 * spans/logs and hand them to server/trace-store.js (server) or ship them to
 * /api/trace (browser, via public/js/core/trace.js).
 *
 * Data model (mirrors db/schema.sql and OpenTelemetry):
 *   trace  = { trace_id, name, root_kind, started_at, ended_at, duration_ms,
 *              status, attributes }
 *   span   = { span_id, trace_id, parent_span_id, name, kind, started_at,
 *              ended_at, duration_ms, status, status_message, attributes, events }
 *   log    = { id, trace_id, span_id, ts, severity, body, attributes }
 *
 * IDs follow the W3C Trace Context sizes: 16-byte trace id, 8-byte span id, as
 * lowercase hex, so a span can be exported to standard tooling unchanged.
 */

export const SPAN_KIND = Object.freeze({
  CLIENT: "client", SERVER: "server", LLM: "llm", TOOL: "tool", DB: "db", HTTP: "http", INTERNAL: "internal"
});
export const STATUS = Object.freeze({ OK: "ok", ERROR: "error" });

// Default cap for any single captured string (prompt, output, tool I/O). Keeps
// rows bounded; the UI shows a "(truncated)" marker when it trips.
export const CONTENT_CAP = 10000;

/* ---------- ids ---------- */
// 16 random bytes -> 32 hex chars (trace id); 8 bytes -> 16 hex chars (span id).
const hex = n => {
  let s = "";
  for (let i = 0; i < n; i++) s += ((Math.random() * 256) | 0).toString(16).padStart(2, "0");
  return s;
};
export const newTraceId = () => hex(16);
export const newSpanId = () => hex(8);
export const newLogId = () => "log" + hex(8);

/* ---------- W3C traceparent propagation ---------- */
// Format: "00-<32 hex trace id>-<16 hex span id>-<2 hex flags>".
export function formatTraceparent(traceId, spanId, sampled = true) {
  if (!isHex(traceId, 32) || !isHex(spanId, 16)) return null;
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

export function parseTraceparent(header) {
  if (!header || typeof header !== "string") return null;
  const p = header.trim().split("-");
  if (p.length !== 4) return null;
  const [version, traceId, spanId, flags] = p;
  if (version !== "00" || !isHex(traceId, 32) || !isHex(spanId, 16) || !isHex(flags, 2)) return null;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return { traceId, spanId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

const isHex = (s, len) => typeof s === "string" && s.length === len && /^[0-9a-f]+$/.test(s);

/* ---------- content capture ---------- */
// Clamp a value for storage. When capture is off we keep only a size hint so a
// span is still useful (how big was the prompt?) without retaining its text.
export function capContent(value, { capture = true, cap = CONTENT_CAP } = {}) {
  if (value == null) return value;
  const str = typeof value === "string" ? value : safeStringify(value);
  if (!capture) return { redacted: true, length: str.length };
  if (str.length <= cap) return str;
  return str.slice(0, cap) + `… (truncated, ${str.length} chars)`;
}

export function safeStringify(value) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

/* ---------- span factory ---------- */
/*
 * startSpan returns a live span handle. Call .child()/.event()/.end() on it;
 * every span created through the same `collector` is pushed to collector.spans
 * when it ends, so a caller can flush them in one batch. A collector is any
 * object with arrays { spans, logs }; makeCollector() builds one.
 */
export function makeCollector(base = {}) {
  return { traceId: base.traceId || newTraceId(), userId: base.userId || null, spans: [], logs: [] };
}

export function startSpan(collector, name, opts = {}) {
  const span = {
    span_id: opts.spanId || newSpanId(),
    trace_id: opts.traceId || collector.traceId,
    parent_span_id: opts.parentSpanId || null,
    name: String(name || "span"),
    kind: opts.kind || SPAN_KIND.INTERNAL,
    started_at: opts.startedAt || now(),
    ended_at: null,
    duration_ms: null,
    status: null,
    status_message: null,
    attributes: { ...(opts.attributes || {}) },
    events: []
  };

  const handle = {
    span,
    get id() { return span.span_id; },
    get traceId() { return span.trace_id; },
    set(attrs) { Object.assign(span.attributes, attrs || {}); return handle; },
    event(evName, attributes) { span.events.push({ name: String(evName), t: now(), attributes: attributes || {} }); return handle; },
    child(childName, childOpts = {}) {
      return startSpan(collector, childName, { ...childOpts, parentSpanId: span.span_id, traceId: span.trace_id });
    },
    end(status = STATUS.OK, message) {
      if (span.ended_at) return handle; // idempotent
      span.ended_at = now();
      span.duration_ms = Math.max(0, Math.round(span.ended_at - span.started_at));
      span.status = status;
      if (message) span.status_message = String(message).slice(0, 500);
      collector.spans.push(span);
      return handle;
    },
    fail(err) { return handle.end(STATUS.ERROR, err && err.message ? err.message : String(err)); }
  };
  return handle;
}

/* ---------- ambient span hook ---------- */
/*
 * Lets runtime-neutral modules (server/web.js) open a child of the active span
 * without importing Node-only context (node:async_hooks). A Node entry point
 * registers a provider via setActiveSpanHook; everywhere else (Edge, browser)
 * the hook stays null and traceChild is a no-op returning null, so callers use
 * `span?.end()` safely.
 */
let _spanHook = null;
export function setActiveSpanHook(fn) { _spanHook = typeof fn === "function" ? fn : null; }
export function traceChild(name, opts = {}) { return _spanHook ? _spanHook(name, opts) : null; }

export function addLog(collector, severity, body, opts = {}) {
  collector.logs.push({
    id: newLogId(),
    trace_id: opts.traceId || collector.traceId || null,
    span_id: opts.spanId || null,
    user_id: opts.userId || collector.userId || null,
    ts: opts.ts || now(),
    severity: String(severity || "info"),
    body: typeof body === "string" ? body : safeStringify(body),
    attributes: opts.attributes || {}
  });
}

// Build the one-row trace summary from a root span (for the list view).
export function traceSummaryFromSpan(span, extra = {}) {
  return {
    trace_id: span.trace_id,
    user_id: extra.userId || null,
    name: span.name,
    root_kind: extra.rootKind || null,
    started_at: span.started_at,
    ended_at: span.ended_at,
    duration_ms: span.duration_ms,
    status: span.status || STATUS.OK,
    attributes: span.attributes || {}
  };
}

// Epoch milliseconds; Date.now() exists in every target runtime.
export function now() { return Date.now(); }
