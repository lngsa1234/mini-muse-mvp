/*
 * Observability request handlers — framework-agnostic, shared by the local
 * Express server (server/index.js) and the Vercel function (api/trace.js).
 * ---------------------------------------------------------------------------
 * Each handler takes already-parsed input plus env and returns { status, json },
 * mirroring server/docs.js and server/web.js. The browser ships batches of its
 * own spans/logs to handleIngest; the viewer page reads them back through
 * handleListTraces / handleGetTrace / handleListLogs. handleConfig tells the
 * client tracer whether to capture/ship and at what sample rate.
 *
 * Everything here is best-effort: a failed write returns an error status but
 * never throws past the caller, so logging can't break a user request.
 */
import { writeBatch, listTraces, getTrace, listLogs } from "./trace-store.js";

// Env flags (read per-call so tests/deploys can flip them without a restart).
const bool = (v, dflt) => (v == null || v === "" ? dflt : !/^(0|false|no|off)$/i.test(String(v)));
const num = (v, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

export function obsConfig(env = {}) {
  return {
    enabled: bool(env.OBS_ENABLED, true),
    captureContent: bool(env.OBS_CAPTURE_CONTENT, true),
    sampleRate: Math.min(1, Math.max(0, num(env.OBS_SAMPLE_RATE, 1))),
    retentionDays: Math.max(0, num(env.OBS_RETENTION_DAYS, 7))
  };
}

/*
 * One query-based router so the local Express route and the Vercel function
 * (api/trace.js) behave identically (Vercel can't nest path routes without a
 * file per segment). Dispatch on method + a `view` query param:
 *   POST /api/trace                 -> ingest
 *   GET  /api/trace                 -> list traces
 *   GET  /api/trace?id=<traceId>    -> one trace (+ spans + logs)
 *   GET  /api/trace?view=logs       -> list logs
 *   GET  /api/trace?view=config     -> client tracer config
 */
export async function dispatch({ method, userId, query = {}, body } = {}, env = {}) {
  if (method === "POST") return handleIngest(userId, body, env);
  if (method !== "GET") return { status: 405, json: { error: "method not allowed" } };
  if (query.view === "config") return handleConfig(env);
  if (query.view === "logs") return handleListLogs(userId, query);
  if (query.id) return handleGetTrace(query.id);
  return handleListTraces(userId, query);
}

/* ---------- config (client tracer reads this at boot) ---------- */
export function handleConfig(env = {}) {
  const { enabled, captureContent, sampleRate } = obsConfig(env);
  return { status: 200, json: { enabled, captureContent, sampleRate } };
}

/* ---------- ingest (POST /api/trace) ---------- */
// Accepts { traces?, spans?, logs? }. Stamps user_id onto every row so the
// browser can't spoof another user's id. Silently no-ops when disabled.
export async function handleIngest(userId, body, env = {}) {
  const { enabled } = obsConfig(env);
  if (!enabled) return { status: 202, json: { written: { traces: 0, spans: 0, logs: 0 }, disabled: true } };

  const traces = asArray(body && body.traces).map(t => ({ ...t, user_id: userId || t.user_id || null }));
  const spans = asArray(body && body.spans);
  const logs = asArray(body && body.logs).map(l => ({ ...l, user_id: userId || l.user_id || null }));
  if (!traces.length && !spans.length && !logs.length) {
    return { status: 400, json: { error: "no traces, spans or logs in body" } };
  }

  try {
    const written = await writeBatch({ traces, spans, logs });
    return { status: 202, json: { written } };
  } catch (e) {
    return { status: 500, json: { error: e?.message || "ingest failed" } };
  }
}

/* ---------- viewer reads ---------- */
export async function handleListTraces(userId, query = {}) {
  try {
    const limit = clampInt(query.limit, 50);
    const traces = await listTraces(userId || null, limit);
    return { status: 200, json: { traces } };
  } catch (e) {
    return { status: 500, json: { error: e?.message || "failed to list traces" } };
  }
}

export async function handleGetTrace(traceId) {
  const id = String(traceId || "").trim();
  if (!id) return { status: 400, json: { error: "trace id is required" } };
  try {
    const { trace, spans, logs } = await getTrace(id);
    if (!trace) return { status: 404, json: { error: "trace not found" } };
    return { status: 200, json: { trace, spans, logs } };
  } catch (e) {
    return { status: 500, json: { error: e?.message || "failed to get trace" } };
  }
}

export async function handleListLogs(userId, query = {}) {
  try {
    const logs = await listLogs({
      userId: userId || null,
      limit: clampInt(query.limit, 100),
      severity: query.severity ? String(query.severity) : undefined
    });
    return { status: 200, json: { logs } };
  } catch (e) {
    return { status: 500, json: { error: e?.message || "failed to list logs" } };
  }
}

/* ---------- helpers ---------- */
const asArray = v => (Array.isArray(v) ? v : []);
const clampInt = (v, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};
