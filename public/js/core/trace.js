/*
 * Browser tracer — the client half of the observability system.
 * ---------------------------------------------------------------------------
 * The browser owns the root trace for an agent turn (or a one-shot generation).
 * Spans and logs are buffered and shipped in batches to POST /api/trace; the
 * server attaches its own spans (openai.chat, tavily.*, db.query) as children
 * via the W3C `traceparent` header this module produces. Mirrors the data model
 * in server/trace-core.js so both halves write the same shapes.
 *
 * Everything is best-effort: if config load or a flush fails the app is
 * unaffected. When the server reports OBS disabled, spans simply aren't shipped.
 */
const CONTENT_CAP = 10000;
const FLUSH_MS = 3000;

let cfg = { enabled: true, captureContent: true, sampleRate: 1 };
let buf = { traces: [], spans: [], logs: [] };
let timer = null;

/* ---------- ids + traceparent (W3C Trace Context sizes) ---------- */
function hex(n) {
  const a = new Uint8Array(n);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < n; i++) a[i] = (Math.random() * 256) | 0;
  let s = "";
  for (const b of a) s += b.toString(16).padStart(2, "0");
  return s;
}
const newTraceId = () => hex(16);
const newSpanId = () => hex(8);
const newLogId = () => "log" + hex(8);
const formatTraceparent = (traceId, spanId, sampled) => `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;

/* ---------- content capping (honours OBS_CAPTURE_CONTENT) ---------- */
const safeStringify = v => {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};
// Wrap a large field (prompt, output, tool I/O) before putting it on a span.
export function cap(value) {
  if (value == null) return value;
  const str = safeStringify(value);
  if (!cfg.captureContent) return { redacted: true, length: str.length };
  if (str.length <= CONTENT_CAP) return str;
  return str.slice(0, CONTENT_CAP) + `… (truncated, ${str.length} chars)`;
}

/* ---------- span factory ---------- */
function makeSpan(ctx) {
  const span = {
    span_id: newSpanId(),
    trace_id: ctx.traceId,
    parent_span_id: ctx.parentSpanId || null,
    name: String(ctx.name || "span"),
    kind: ctx.kind || "client",
    started_at: Date.now(),
    ended_at: null,
    duration_ms: null,
    status: null,
    status_message: null,
    attributes: { ...(ctx.attributes || {}) },
    events: []
  };
  const sampled = ctx.sampled !== false;
  const handle = {
    span,
    sampled,
    get id() { return span.span_id; },
    get traceId() { return span.trace_id; },
    set(attrs) { Object.assign(span.attributes, attrs || {}); return handle; },
    event(evName, attributes) { span.events.push({ name: String(evName), t: Date.now(), attributes: attributes || {} }); return handle; },
    child(childName, opts = {}) {
      return makeSpan({
        traceId: span.trace_id, parentSpanId: span.span_id, name: childName,
        kind: opts.kind, attributes: opts.attributes, sampled
      });
    },
    traceparent() { return formatTraceparent(span.trace_id, span.span_id, sampled); },
    log(severity, body, opts = {}) {
      pushLog({ trace_id: span.trace_id, span_id: span.span_id, severity, body, attributes: opts.attributes });
      return handle;
    },
    end(status = "ok", message) {
      if (span.ended_at) return handle; // idempotent
      span.ended_at = Date.now();
      span.duration_ms = Math.max(0, span.ended_at - span.started_at);
      span.status = status;
      if (message) span.status_message = String(message).slice(0, 500);
      if (sampled) {
        buf.spans.push(span);
        if (ctx.isRoot) buf.traces.push(traceSummary(span, ctx.rootKind));
      }
      return handle;
    },
    fail(err) { return handle.end("error", err && err.message ? err.message : String(err)); }
  };
  return handle;
}

function traceSummary(span, rootKind) {
  return {
    trace_id: span.trace_id,
    name: span.name,
    root_kind: rootKind || null,
    started_at: span.started_at,
    ended_at: span.ended_at,
    duration_ms: span.duration_ms,
    status: span.status || "ok",
    attributes: span.attributes || {}
  };
}

function pushLog({ trace_id, span_id, severity, body, attributes }) {
  buf.logs.push({
    id: newLogId(),
    trace_id: trace_id || null,
    span_id: span_id || null,
    ts: Date.now(),
    severity: String(severity || "info"),
    body: typeof body === "string" ? body : safeStringify(body),
    attributes: attributes || {}
  });
}

/* ---------- public API ---------- */
// Open a root trace. Decides sampling once; child spans inherit it. When OBS is
// off or the turn isn't sampled, spans are created but never buffered/shipped.
export function startTrace(name, opts = {}) {
  const sampled = cfg.enabled && Math.random() < (cfg.sampleRate ?? 1);
  return makeSpan({
    traceId: newTraceId(), name, isRoot: true,
    rootKind: opts.rootKind || "agent_turn",
    kind: opts.kind || "client",
    attributes: opts.attributes,
    sampled
  });
}

export function log(severity, body, opts = {}) { pushLog({ severity, body, ...opts }); }
export function enabled() { return !!cfg.enabled; }

/*
 * Ambient active span, so API calls (core/api.js) and the transport can attach
 * a `traceparent` without threading the span through every call. Callers set it
 * around a scope and restore the previous value:
 *   const prev = setActive(span); try { ... } finally { setActive(prev); }
 */
let _active = null;
export function setActive(span) { const prev = _active; _active = span || null; return prev; }
export function activeSpan() { return _active; }
export function activeTraceparent() { return _active ? _active.traceparent() : null; }

/* ---------- shipping ---------- */
export async function flush({ beacon = false } = {}) {
  if (!buf.traces.length && !buf.spans.length && !buf.logs.length) return;
  const batch = buf;
  buf = { traces: [], spans: [], logs: [] };
  const body = JSON.stringify(batch);
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/trace", new Blob([body], { type: "application/json" }));
      return;
    }
    await fetch("/api/trace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body, keepalive: true
    });
  } catch {
    // best-effort: drop the batch rather than surface an error
  }
}

// Call once at boot. Loads capture config, then starts the periodic flush and
// flushes on page hide so in-flight spans aren't lost on navigation/unload.
export async function initTracer() {
  try {
    const res = await fetch("/api/trace?view=config");
    if (res.ok) cfg = { ...cfg, ...(await res.json()) };
  } catch {
    // keep defaults; a missing config endpoint shouldn't disable the app
  }
  if (!timer) timer = setInterval(() => flush(), FLUSH_MS);
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush({ beacon: true }); });
  addEventListener("pagehide", () => flush({ beacon: true }));
  return cfg;
}
