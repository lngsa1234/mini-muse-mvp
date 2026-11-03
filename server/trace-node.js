/*
 * Observability — Node server context.
 * ---------------------------------------------------------------------------
 * Node-only (uses node:async_hooks), so it is imported by the Express server
 * and the Vercel Node functions, but NOT by the Edge function (api/llm.js) or
 * the browser. It carries the active trace collector + current span through an
 * AsyncLocalStorage so deep callees (server/db.js, server/web.js) can attach
 * child spans without threading a context argument through every call.
 *
 * withTrace(name, fn) wraps a framework-agnostic handler (req -> {status,json}):
 * it reads the incoming W3C `traceparent`, opens a `server` span, runs the
 * handler inside the ALS context, then flushes the collected spans/logs to Neon
 * best-effort. If OBS is disabled it runs the handler untouched. A write failure
 * is swallowed so tracing can never break a user request.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  makeCollector, startSpan, parseTraceparent, traceSummaryFromSpan,
  setActiveSpanHook, SPAN_KIND, STATUS
} from "./trace-core.js";
import { obsConfig } from "./trace.js";
import { writeBatch, upsertTrace } from "./trace-store.js";

const als = new AsyncLocalStorage();

// The active { collector, span } for the current request, or null outside one.
export function activeContext() {
  return als.getStore() || null;
}
export function activeCollector() {
  const ctx = als.getStore();
  return ctx ? ctx.collector : null;
}
// The span deep callees should parent new child spans under.
export function activeSpan() {
  const ctx = als.getStore();
  return ctx ? ctx.span : null;
}

// Start a child of the active span (used by db.js / web.js). Returns null when
// no context is active or OBS is off, so callers can `span?.end()` safely.
export function startChildSpan(name, opts = {}) {
  const ctx = als.getStore();
  if (!ctx || !ctx.collector) return null;
  const parent = ctx.span;
  return parent
    ? parent.child(name, opts)
    : startSpan(ctx.collector, name, opts);
}

// Register startChildSpan as trace-core's ambient hook so runtime-neutral
// modules (server/web.js) can open child spans without importing this file.
setActiveSpanHook(startChildSpan);

function headerValue(req, key) {
  const h = req && req.headers;
  if (!h) return null;
  if (typeof h.get === "function") return h.get(key);        // Headers (Request)
  return h[key] || h[key.toLowerCase()] || null;              // plain object (Express/Node)
}

/*
 * Wrap a handler of shape (req) => Promise<{status, json}>. Returns a handler of
 * the same shape so it drops into server/index.js's existing route plumbing.
 */
export function withTrace(name, fn, { env = process.env, userId = null } = {}) {
  return async function wrapped(req) {
    const cfg = obsConfig(env);
    if (!cfg.enabled) return fn(req);

    const parent = parseTraceparent(headerValue(req, "traceparent"));
    const uid = typeof userId === "function" ? userId(req) : userId;
    const collector = makeCollector({ traceId: parent ? parent.traceId : undefined, userId: uid });
    const span = startSpan(collector, name, {
      kind: SPAN_KIND.SERVER,
      parentSpanId: parent ? parent.spanId : null,
      attributes: {
        "http.request.method": req && req.method,
        "http.route": name,
        "user.id": uid || undefined
      }
    });

    let result;
    try {
      result = await als.run({ collector, span }, () => fn(req));
      const ok = !result || typeof result.status !== "number" || result.status < 500;
      span.set({ "http.response.status_code": result && result.status });
      span.end(ok ? STATUS.OK : STATUS.ERROR, ok ? undefined : jsonError(result));
      return result;
    } catch (e) {
      span.fail(e);
      throw e;
    } finally {
      await flush(collector, span, parent, uid);
    }
  };
}

// Write the collected spans/logs (and, when this is the root, a trace row).
async function flush(collector, rootSpan, parent, uid) {
  try {
    // When there's no incoming traceparent this server span is the root, so
    // emit a trace summary; otherwise the browser owns the trace row.
    const traces = parent ? [] : [traceSummaryFromSpan(rootSpan.span, { userId: uid, rootKind: "api" })];
    if (parent) {
      await writeBatch({ spans: collector.spans, logs: collector.logs });
    } else {
      await writeBatch({ traces, spans: collector.spans, logs: collector.logs });
    }
  } catch {
    // best-effort: never let a logging failure surface to the user
  }
}

const jsonError = result => {
  const j = result && result.json;
  return (j && (j.error || j.message)) || undefined;
};

// Export upsertTrace passthrough so edge/other callers can reuse one import path.
export { upsertTrace };
