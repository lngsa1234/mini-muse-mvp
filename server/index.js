/*
 * Mini Muse backend (local development)
 * -------------------------------------------------------------------------
 * Serves the static front-end and proxies the OpenAI API so the
 * API key stays on the server. The browser sends a `tier` ("quick" | "default")
 * and server/routing.js maps it to a configured model; the raw response
 * (including the SSE stream) is piped straight back to the client.
 *
 * When deployed to Vercel, api/llm.js does the same job.
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import express from "express";
import { buildUpstreamRequest, UPSTREAM_UNREACHABLE, health } from "./proxy.js";
import { routeModel } from "./routing.js";
import { currentUserId } from "./auth.js";
import { handleList, handleCreate, handleDelete } from "./docs.js";
import * as ideas from "./ideas.js";
import * as goals from "./goals.js";
import * as web from "./web.js";
import * as google from "./google.js";
import * as trace from "./trace.js";
import { withTrace } from "./trace-node.js";
import { makeCollector, startSpan, parseTraceparent, SPAN_KIND, STATUS } from "./trace-core.js";
import { writeBatch } from "./trace-store.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

app.use(express.json({ limit: "6mb" })); // base64 file uploads can be a few MB
app.use(express.static(PUBLIC_DIR));

// Run a { status, json } handler and send it; one try/catch for every route.
// `name` labels the server span withTrace opens so child db/http spans attach.
const done = res => ({ status, json }) => res.status(status).json(json);
const route = (name, fn) => {
  const traced = withTrace(name, fn, { userId: currentUserId });
  return async (req, res) => {
    try { done(res)(await traced(req)); } catch (e) { res.status(500).json({ error: e.message }); }
  };
};

/* ---------- Library documents (Neon Postgres) ---------- */
app.get("/api/docs", route("GET /api/docs", req => handleList(currentUserId(req))));
app.post("/api/docs", route("POST /api/docs", req => handleCreate(currentUserId(req), req.body)));
app.delete("/api/docs/:id", route("DELETE /api/docs/:id", req => handleDelete(currentUserId(req), req.params.id)));

/* ---------- Ideas & Goals (Neon) ---------- */
// Register the same CRUD shape for both resources; handlers share server/docs.js's
// { status, json } contract, so one helper wires list/create/update/delete.
const wire = (base, h) => {
  app.get(`/api/${base}`, route(`GET /api/${base}`, req => h.handleList(currentUserId(req))));
  app.post(`/api/${base}`, route(`POST /api/${base}`, req => h.handleCreate(currentUserId(req), req.body)));
  app.patch(`/api/${base}/:id`, route(`PATCH /api/${base}/:id`, req => h.handleUpdate(currentUserId(req), req.params.id, req.body)));
  app.delete(`/api/${base}/:id`, route(`DELETE /api/${base}/:id`, req => h.handleDelete(currentUserId(req), req.params.id)));
};
wire("ideas", ideas);
wire("goals", goals);

/* ---------- Web browsing (Tavily search + extract) ---------- */
app.post("/api/web/search", route("POST /api/web/search", req => web.handleSearch(req.body, process.env)));
app.post("/api/web/open", route("POST /api/web/open", req => web.handleOpen(req.body, process.env)));

/* ---------- Google connectors (OAuth, Gmail, Calendar) ---------- */
const googleRoute = fn => async (req, res) => {
  try {
    const out = await fn(req);
    if (out.cookie) res.setHeader("Set-Cookie", out.cookie);
    if (out.cookies) res.setHeader("Set-Cookie", out.cookies);
    if (out.redirect) return res.redirect(out.redirect);
    return done(res)(out);
  } catch (e) {
    if (e.cookie) res.setHeader("Set-Cookie", e.cookie);
    return res.status(e.status || 500).json({ error: e.message || "Google request failed." });
  }
};
app.get("/api/google/status", googleRoute(req => google.handleGoogleStatus(req, process.env)));
app.get("/api/google/authorize", googleRoute(req => google.handleGoogleAuthorize(req, process.env)));
app.get("/api/google/callback", googleRoute(req => google.handleGoogleCallback(req, process.env)));
app.post("/api/google/disconnect", googleRoute(req => google.handleGoogleDisconnect(req, process.env)));
app.post("/api/google/mail/search", googleRoute(req => google.googleMailSearch(req, req.body, process.env)));
app.post("/api/google/mail/read", googleRoute(req => google.googleMailRead(req, req.body, process.env)));
app.post("/api/google/mail/send", googleRoute(req => google.googleMailSend(req, req.body, process.env)));
app.post("/api/google/calendar/list", googleRoute(req => google.googleCalendarList(req, req.body, process.env)));
app.post("/api/google/calendar/add", googleRoute(req => google.googleCalendarAdd(req, req.body, process.env)));
app.post("/api/google/calendar/remove", googleRoute(req => google.googleCalendarRemove(req, req.body, process.env)));

/* ---------- Observability (ingest + viewer) ---------- */
// Query-based dispatch shared with api/trace.js. These routes are NOT wrapped
// in withTrace (ingest/reads would otherwise trace the tracer).
const traceRoute = async (req, res) => {
  try {
    const out = await trace.dispatch(
      { method: req.method, userId: currentUserId(req), query: req.query, body: req.body },
      process.env
    );
    done(res)(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
app.get("/api/trace", traceRoute);
app.post("/api/trace", traceRoute);


app.post("/api/llm", async (req, res) => {
  const up = buildUpstreamRequest(req.body, process.env);
  if (up.error) return res.status(up.error.status).json(up.error.body);

  // Server-side LLM span: model, tier, latency-to-first-byte and HTTP status.
  // Token usage is captured client-side (stream_options.include_usage); teeing
  // the SSE stream here is out of scope. The span attaches to the browser's
  // trace via its traceparent, or stands alone if there isn't one.
  const span = llmSpan(req);

  let upstream;
  try {
    upstream = await fetch(up.url, up.init);
  } catch (e) {
    if (span) { span.fail(e); flushLlm(span); }
    return res.status(UPSTREAM_UNREACHABLE.status).json(UPSTREAM_UNREACHABLE.body);
  }

  if (span) {
    span.set({ "http.response.status_code": upstream.status });
    span.end(upstream.ok ? STATUS.OK : STATUS.ERROR, upstream.ok ? undefined : `upstream ${upstream.status}`);
    flushLlm(span);
  }

  res.status(upstream.status);
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("content-type", ct);

  if (!upstream.body) {
    const text = await upstream.text();
    return res.send(text);
  }

  // Pipe the (possibly streaming) response straight through to the browser.
  Readable.fromWeb(upstream.body).pipe(res);
});

// Build an openai.chat LLM span (or null when OBS is off). Carries its own
// collector so flushLlm can write it without an ALS context on this route.
function llmSpan(req) {
  const cfg = trace.obsConfig(process.env);
  if (!cfg.enabled) return null;
  const parent = parseTraceparent(req.headers.traceparent);
  const collector = makeCollector({ traceId: parent ? parent.traceId : undefined, userId: currentUserId(req) });
  const handle = startSpan(collector, "openai.chat", {
    kind: SPAN_KIND.LLM,
    parentSpanId: parent ? parent.spanId : null,
    attributes: {
      "gen_ai.system": "openai",
      "gen_ai.request.model": routeModel(req.body, process.env),
      "gen_ai.request.tier": (req.body && req.body.tier) || "default"
    }
  });
  handle._collector = collector;
  return handle;
}

function flushLlm(span) {
  if (!span || !span._collector) return;
  writeBatch({ spans: span._collector.spans }).catch(() => {});
}

app.get(["/healthz", "/api/healthz"], (_req, res) => res.json(health(process.env)));

app.listen(PORT, () => {
  console.log(`Mini Muse running at http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("WARNING: OPENAI_API_KEY is not set. Chat will be disabled until you add it to .env");
  }
});
