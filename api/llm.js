/*
 * Mini Muse backend — Vercel Edge Function
 * -------------------------------------------------------------------------
 * Serverless equivalent of the /api/llm route in server/index.js; both
 * share server/proxy.js and server/routing.js. Runs on the Edge runtime so
 * SSE streaming works without the short default timeout of Node serverless
 * functions.
 */
import { buildUpstreamRequest, UPSTREAM_UNREACHABLE } from "../server/proxy.js";
import { routeModel } from "../server/routing.js";
import { makeCollector, startSpan, parseTraceparent, SPAN_KIND, STATUS } from "../server/trace-core.js";
import { obsConfig } from "../server/trace.js";
import { writeBatch } from "../server/trace-store.js";

export const config = { runtime: "edge" };

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ code: "method_not_allowed", message: "Use POST." }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const up = buildUpstreamRequest(body, process.env);
  if (up.error) return json(up.error.body, up.error.status);

  // Explicit LLM span (no AsyncLocalStorage on Edge). Fire-and-forget the Neon
  // write so it never delays or breaks the streamed response.
  const span = llmSpan(req, body);

  let upstream;
  try {
    upstream = await fetch(up.url, up.init);
  } catch {
    if (span) { span.fail(new Error("upstream unreachable")); flushLlm(span); }
    return json(UPSTREAM_UNREACHABLE.body, UPSTREAM_UNREACHABLE.status);
  }

  if (span) {
    span.set({ "http.response.status_code": upstream.status });
    span.end(upstream.ok ? STATUS.OK : STATUS.ERROR, upstream.ok ? undefined : `upstream ${upstream.status}`);
    flushLlm(span);
  }

  // Pipe the (possibly streaming) response straight through to the browser.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" }
  });
}

function llmSpan(req, body) {
  const cfg = obsConfig(process.env);
  if (!cfg.enabled) return null;
  const parent = parseTraceparent(req.headers.get("traceparent"));
  const collector = makeCollector({ traceId: parent ? parent.traceId : undefined });
  const handle = startSpan(collector, "openai.chat", {
    kind: SPAN_KIND.LLM,
    parentSpanId: parent ? parent.spanId : null,
    attributes: {
      "gen_ai.system": "openai",
      "gen_ai.request.model": routeModel(body, process.env),
      "gen_ai.request.tier": (body && body.tier) || "default"
    }
  });
  handle._collector = collector;
  return handle;
}

function flushLlm(span) {
  if (!span || !span._collector) return;
  writeBatch({ spans: span._collector.spans }).catch(() => {});
}
