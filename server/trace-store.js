/*
 * Observability storage — Neon Postgres writes and reads for traces/spans/logs.
 * ---------------------------------------------------------------------------
 * Node-only (used by the Express server, the Vercel Node functions and the
 * purge script). It keeps its OWN neon connection rather than reusing
 * server/db.js's sql(), because db.js's query function is wrapped to emit
 * `db.query` spans — routing trace writes through it would trace the tracer.
 *
 * Every write is best-effort: callers wrap these in try/catch so a logging
 * failure can never break a user request. Timestamps arrive as epoch ms and are
 * converted to ISO strings for the timestamptz columns.
 */
import { neon } from "@neondatabase/serverless";

let _raw = null;
function raw() {
  if (!_raw) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _raw = neon(url);
  }
  return _raw;
}

const iso = ms => (ms == null ? null : new Date(ms).toISOString());
const jsonb = v => JSON.stringify(v == null ? (Array.isArray(v) ? [] : {}) : v);

/* ---------- writes ---------- */
export async function upsertTrace(t) {
  if (!t || !t.trace_id) return;
  const s = raw();
  await s`
    insert into traces (trace_id, user_id, name, root_kind, started_at, ended_at, duration_ms, status, attributes)
    values (${t.trace_id}, ${t.user_id || null}, ${t.name || "trace"}, ${t.root_kind || null},
            ${iso(t.started_at)}, ${iso(t.ended_at)}, ${t.duration_ms ?? null}, ${t.status || null},
            ${jsonb(t.attributes || {})}::jsonb)
    on conflict (trace_id) do update set
      name        = excluded.name,
      root_kind   = coalesce(excluded.root_kind, traces.root_kind),
      ended_at    = coalesce(excluded.ended_at, traces.ended_at),
      duration_ms = coalesce(excluded.duration_ms, traces.duration_ms),
      status      = coalesce(excluded.status, traces.status),
      attributes  = excluded.attributes`;
}

export async function insertSpans(spans) {
  if (!Array.isArray(spans) || !spans.length) return 0;
  const s = raw();
  // One insert per span; span_id is the PK so retries are idempotent. Batches
  // are small (a handful per request), so concurrent inserts are fine.
  await Promise.all(spans.map(sp => s`
    insert into spans (span_id, trace_id, parent_span_id, name, kind, started_at, ended_at,
                       duration_ms, status, status_message, attributes, events)
    values (${sp.span_id}, ${sp.trace_id}, ${sp.parent_span_id || null}, ${sp.name || "span"},
            ${sp.kind || null}, ${iso(sp.started_at)}, ${iso(sp.ended_at)}, ${sp.duration_ms ?? null},
            ${sp.status || null}, ${sp.status_message || null},
            ${jsonb(sp.attributes || {})}::jsonb, ${jsonb(sp.events || [])}::jsonb)
    on conflict (span_id) do nothing`));
  return spans.length;
}

export async function insertLogs(logs) {
  if (!Array.isArray(logs) || !logs.length) return 0;
  const s = raw();
  await Promise.all(logs.map(l => s`
    insert into logs (id, trace_id, span_id, user_id, ts, severity, body, attributes)
    values (${l.id}, ${l.trace_id || null}, ${l.span_id || null}, ${l.user_id || null},
            ${iso(l.ts)}, ${l.severity || "info"}, ${l.body || ""}, ${jsonb(l.attributes || {})}::jsonb)
    on conflict (id) do nothing`));
  return logs.length;
}

// Write a whole batch (traces first so the list view always has a row).
export async function writeBatch({ traces = [], spans = [], logs = [] } = {}) {
  for (const t of traces) await upsertTrace(t);
  await insertSpans(spans);
  await insertLogs(logs);
  return { traces: traces.length, spans: spans.length, logs: logs.length };
}

/* ---------- reads (viewer) ---------- */
export async function listTraces(userId, limit = 50) {
  const s = raw();
  const lim = Math.min(Math.max(1, limit | 0), 200);
  const rows = userId
    ? await s`select t.*, (select count(*) from spans sp where sp.trace_id = t.trace_id) as span_count
              from traces t where t.user_id = ${userId} order by t.started_at desc limit ${lim}`
    : await s`select t.*, (select count(*) from spans sp where sp.trace_id = t.trace_id) as span_count
              from traces t order by t.started_at desc limit ${lim}`;
  return rows.map(toTrace);
}

export async function getTrace(traceId) {
  const s = raw();
  const trows = await s`select * from traces where trace_id = ${traceId}`;
  const spans = await s`select * from spans where trace_id = ${traceId} order by started_at asc`;
  const logs = await s`select * from logs where trace_id = ${traceId} order by ts asc`;
  return {
    trace: trows[0] ? toTrace(trows[0]) : null,
    spans: spans.map(toSpan),
    logs: logs.map(toLog)
  };
}

export async function listLogs({ userId, limit = 100, severity } = {}) {
  const s = raw();
  const lim = Math.min(Math.max(1, limit | 0), 500);
  let rows;
  if (userId && severity) rows = await s`select * from logs where user_id = ${userId} and severity = ${severity} order by ts desc limit ${lim}`;
  else if (userId) rows = await s`select * from logs where user_id = ${userId} order by ts desc limit ${lim}`;
  else if (severity) rows = await s`select * from logs where severity = ${severity} order by ts desc limit ${lim}`;
  else rows = await s`select * from logs order by ts desc limit ${lim}`;
  return rows.map(toLog);
}

/* ---------- retention ---------- */
export async function purgeOlderThan(days) {
  const s = raw();
  const d = Math.max(0, Number(days) || 0);
  const cutoff = new Date(Date.now() - d * 86400000).toISOString();
  const sp = await s`delete from spans  where created_at < ${cutoff} returning span_id`;
  const lg = await s`delete from logs   where created_at < ${cutoff} returning id`;
  const tr = await s`delete from traces where created_at < ${cutoff} returning trace_id`;
  return { spans: sp.length, logs: lg.length, traces: tr.length, cutoff };
}

/* ---------- row -> client shape ---------- */
const ms = v => (v == null ? null : new Date(v).getTime());
const arr = v => (Array.isArray(v) ? v : []);
const obj = v => (v && typeof v === "object" ? v : {});

const toTrace = r => ({
  traceId: r.trace_id,
  userId: r.user_id || null,
  name: r.name,
  rootKind: r.root_kind || null,
  startedAt: ms(r.started_at),
  endedAt: ms(r.ended_at),
  durationMs: r.duration_ms ?? null,
  status: r.status || null,
  attributes: obj(r.attributes),
  spanCount: r.span_count != null ? Number(r.span_count) : undefined
});

const toSpan = r => ({
  spanId: r.span_id,
  traceId: r.trace_id,
  parentSpanId: r.parent_span_id || null,
  name: r.name,
  kind: r.kind || null,
  startedAt: ms(r.started_at),
  endedAt: ms(r.ended_at),
  durationMs: r.duration_ms ?? null,
  status: r.status || null,
  statusMessage: r.status_message || null,
  attributes: obj(r.attributes),
  events: arr(r.events)
});

const toLog = r => ({
  id: r.id,
  traceId: r.trace_id || null,
  spanId: r.span_id || null,
  userId: r.user_id || null,
  ts: ms(r.ts),
  severity: r.severity,
  body: r.body,
  attributes: obj(r.attributes)
});
