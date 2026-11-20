/*
 * HTTP endpoints for the server-side agent (ADR-0009). Shared by the Express
 * server (server/index.js) and the Vercel function (api/agent.js); both hand
 * over Node's (req, res).
 *
 *   POST /api/agent/turn    { text | checkin, tier, tz }  -> text/event-stream of turn events
 *   POST /api/agent/answer  { waitId, answer } | { waitId, result } | { waitId, error }
 *   POST /api/agent/cancel  { messageId }
 *   GET  /api/agent/tools   -> { tools: [{ name, feature, connector? }] }
 *
 * The turn keeps running if the browser disconnects: its messages are saved as
 * it goes, and the next GET /api/state shows the result.
 */
import { currentUserId } from "../auth.js";
import { dbStore } from "../userdata.js";
import { withTrace } from "../trace-node.js";
import { handleSearch as jobsSearch } from "../jobs.js";
import { handleGoogleStatus } from "../google.js";
import { handlers as googleHandlers } from "../google-route.js";
import { makeLlm } from "./llm.js";
import { makeDbRepo } from "./repo.js";
import { webServices } from "./tools/web.js";
import { allTools } from "./tools/index.js";
import { runTurn, answerWait, cancelTurn } from "./runtime.js";

const KEEPALIVE_MS = 15_000;

// Everything a turn needs to reach the outside world, bound to this request
// (Google tokens are in its HttpOnly cookie).
export function requestServices(req, env) {
  return {
    ...webServices(env),
    jobsSearch: body => jobsSearch(body, env),
    google: async (action, body) => {
      const fn = googleHandlers[action];
      if (!fn) throw new Error("unknown Google action " + action);
      const out = await fn(req, body, env);
      if (out.status >= 400) throw new Error(out.json?.error || `Google request failed (${out.status})`);
      return out.json;
    }
  };
}

export function turnDeps(req, userId, env = process.env) {
  let googleConnected = false;
  try { googleConnected = !!handleGoogleStatus(req, env).json?.connected; } catch (_) {}
  return { store: dbStore(), repo: makeDbRepo(userId), llm: makeLlm({ env }), services: requestServices(req, env), env, googleConnected };
}

// Stream one turn as Server-Sent Events.
export async function serveTurn(req, res, body, { env = process.env, deps } = {}) {
  const userId = currentUserId(req);
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  let open = true;
  res.on?.("close", () => { open = false; }); // the browser went away (req "close" fires once the body is read)
  const send = (event, data) => {
    if (!open || res.writableEnded) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? null)}\n\n`); } catch (_) { open = false; }
  };
  const ping = setInterval(() => { if (open) try { res.write(": ping\n\n"); } catch (_) {} }, KEEPALIVE_MS);
  try {
    const input = { text: body?.text, checkin: !!body?.checkin, tier: body?.tier, tz: typeof body?.tz === "string" ? body.tz.slice(0, 64) : "UTC" };
    const run = () => runTurn({ userId, input, deps: deps || turnDeps(req, userId, env), emit: send }).then(() => ({ status: 200, json: {} }));
    await withTrace("agent.turn", run, { userId })(req);
  } catch (e) {
    send("error", { code: "server_error", message: e?.message || String(e) });
  } finally {
    clearInterval(ping);
    if (!res.writableEnded) res.end();
  }
}

export async function dispatchAgent(store, { method, action, userId, body }) {
  if (action === "answer" && method === "POST") {
    if (!body?.waitId) return { status: 400, json: { error: "waitId is required" } };
    const response = "answer" in body ? { answer: body.answer === true } : { result: body.result ?? null, ...(body.error ? { error: String(body.error) } : {}) };
    const ok = await answerWait(store, userId, body.waitId, response);
    return { status: ok ? 200 : 409, json: ok ? { ok } : { ok, error: "That request already ended." } };
  }
  if (action === "cancel" && method === "POST") {
    if (!body?.messageId) return { status: 400, json: { error: "messageId is required" } };
    await cancelTurn(store, userId, body.messageId);
    return { status: 200, json: { ok: true } };
  }
  if (action === "tools" && method === "GET") return { status: 200, json: { tools: allTools() } };
  return { status: 404, json: { error: "not found" } };
}

// Node (req, res) handler for every /api/agent/* route.
export async function handleAgent(action, req, res, body) {
  if (action === "turn") {
    if (req.method !== "POST") return res.writeHead(405, { "content-type": "application/json" }).end(JSON.stringify({ error: "Use POST." }));
    return serveTurn(req, res, body);
  }
  const userId = currentUserId(req);
  const out = await dispatchAgent(dbStore(), { method: req.method, action, userId, body });
  res.writeHead(out.status, { "content-type": "application/json" }).end(JSON.stringify(out.json));
}
