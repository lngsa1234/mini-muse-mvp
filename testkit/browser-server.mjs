// A Mini Muse server for browser tests: the real front-end and agent runtime,
// with in-memory storage, a scripted model and fake Google. No database, no
// API keys, nothing leaves the machine.
//
//   node testkit/browser-server.mjs        (PORT, default 4173)
//
// Tests drive it through /__test:
//   POST /__test/reset  { state?, chat?, ideas?, goals?, docs?, google?, mail?, jobs?, fit?, page?, script?, json?, traces?, llmError? }
//     mail: Gmail messages mail_search returns · jobs: postings jobs_search returns ·
//     fit: the model's JSON reply for score_fit · page: what web_open reads
//   GET  /__test/seen   -> { turns: [model requests], json: [prompts], google, state }
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { makeMemoryStore } from "../server/agent/memory-store.js";
import { makeMemoryRepo } from "../server/agent/repo.js";
import { serveTurn, dispatchAgent } from "../server/agent/http.js";
import { dispatchState } from "../server/state.js";
import { fakeLlm } from "./agent.js";
import { currentUserId } from "../server/auth.js";
import { handleCreate } from "../server/docs.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const U = currentUserId(); // the same signed-in user the agent turn sees

let world;
function reset(seed = {}) {
  const store = makeMemoryStore();
  const repo = makeMemoryRepo({ ideas: seed.ideas, goals: seed.goals, docs: seed.docs });
  const turns = [];
  world = { store, repo, seed, turns, json: [], google: !!seed.google, googleCalls: [], llm: fakeLlm(seed.script || [], turns) };
  if (seed.fit) world.llm.json = async () => JSON.parse(JSON.stringify(seed.fit));
  if (seed.llmError) world.llm.chat = async () => { throw Object.assign(new Error(seed.llmError.message || "llm error"), seed.llmError); };
  return world;
}
reset();

async function seedStore(seed) {
  const { audit, ...state } = seed.state || {};
  if (Object.keys(state).length) await world.store.patchState(U, state);
  if (audit) await world.store.appendAudit(U, audit); // newest first, as the app keeps it
  for (const m of seed.chat || []) await world.store.saveMessage(U, m);
}

const app = express();
app.use(express.json({ limit: "6mb" }));
app.use(express.static(PUBLIC_DIR));
const send = res => ({ status, json }) => res.status(status).json(json);
const ok = (res, json, status = 200) => res.status(status).json(json);

app.post("/__test/reset", async (req, res) => { reset(req.body || {}); await seedStore(req.body || {}); ok(res, { ok: true }); });
app.get("/__test/seen", async (_req, res) => ok(res, { turns: world.turns, json: world.json, google: world.googleCalls, state: await world.store.getState(U) }));

// User state and chat.
app.all(["/api/state", "/api/state/:action"], async (req, res) => send(res)(await dispatchState(world.store, { method: req.method, action: req.params.action || "", userId: U, body: req.body })));

// Documents, ideas, goals.
const r = () => world.repo;
app.get("/api/docs", async (_q, res) => ok(res, { docs: await r().listDocs() }));
// Uploads go through the real handler (size limit, text extraction), stored in memory.
app.post("/api/docs", async (q, res) => send(res)(await handleCreate(U, q.body, { createDoc: (_u, d) => r().createDoc(d.title, d.text) })));
app.delete("/api/docs/:id", async (q, res) => { try { ok(res, await r().removeDoc(q.params.id)); } catch (e) { ok(res, { error: e.message }, 404); } });
app.get("/api/ideas", async (_q, res) => ok(res, { ideas: await r().listIdeas() }));
app.post("/api/ideas", async (q, res) => ok(res, { idea: await r().createIdea(q.body) }, 201));
app.patch("/api/ideas/:id", async (q, res) => { try { ok(res, { idea: await r().updateIdea(q.params.id, q.body) }); } catch (e) { ok(res, { error: e.message }, 404); } });
app.delete("/api/ideas/:id", async (q, res) => { world.repo.data.ideas = world.repo.data.ideas.filter(i => i.id !== q.params.id); ok(res, { removed: q.params.id }); });
app.get("/api/goals", async (_q, res) => ok(res, { goals: await r().listGoals() }));
app.post("/api/goals", async (q, res) => ok(res, { goal: await r().createGoal({ ...q.body, steps: (q.body.steps || []).map(s => s.text || s) }) }, 201));
app.patch("/api/goals/:id", async (q, res) => { try { ok(res, { goal: await r().updateGoal(q.params.id, q.body) }); } catch (e) { ok(res, { error: e.message }, 404); } });
app.delete("/api/goals/:id", async (q, res) => { world.repo.data.goals = world.repo.data.goals.filter(g => g.id !== q.params.id); ok(res, { removed: q.params.id }); });

// Google, faked: connected or not, as the test seeds it.
app.get("/api/google/status", (_q, res) => ok(res, { configured: true, connected: world.google }));
app.get("/api/google/authorize", (_q, res) => { world.googleCalls.push("authorize"); res.status(200).type("html").send("<p>google consent (test)</p>"); });
app.post("/api/google/disconnect", (_q, res) => { world.googleCalls.push("disconnect"); world.google = false; ok(res, { connected: false }); });
const googleReply = action => ({ messages: action === "mail/search" ? world.seed.mail || [] : [], events: [], id: "x1" });
app.post("/api/google/:kind/:action", (q, res) => { const action = q.params.kind + "/" + q.params.action; world.googleCalls.push(action); ok(res, googleReply(action)); });

// The agent: the real runtime with the scripted model.
const services = () => ({
  google: async action => { world.googleCalls.push(action); return googleReply(action); },
  webSearch: async () => ({ status: 200, json: { results: [] } }),
  webOpen: async () => ({ status: 200, json: world.seed.page || { title: "", url: "", text: "" } }),
  jobsSearch: async () => { const jobs = world.seed.jobs || []; return { status: 200, json: { mode: "discover", jobs, total: jobs.length, searched: ["greenhouse", "lever", "ashby"] } }; }
});
app.post("/api/agent/turn", (req, res) => serveTurn(req, res, req.body || {}, {
  deps: { store: world.store, repo: world.repo, llm: world.llm, env: {}, googleConnected: world.google, services: services(), timeouts: world.seed.timeouts }
}));
app.all("/api/agent/:action", async (req, res) => send(res)(await dispatchAgent(world.store, { method: req.method, action: req.params.action, userId: U, body: req.body })));

// One-shot JSON completions (Ideas "Update with Muse"): scripted replies in order.
app.post("/api/llm", (req, res) => {
  world.json.push(req.body?.messages?.[0]?.content || "");
  const next = (world.seed.json || []).shift();
  if (next == null) return ok(res, { error: "no scripted reply" }, 500);
  ok(res, { choices: [{ message: { content: typeof next === "string" ? next : JSON.stringify(next) } }] });
});

// Observability: config off for the tracer; seeded traces for the viewer.
app.all("/api/trace", (req, res) => {
  if (req.method === "POST") return ok(res, { written: {} }, 202);
  if (req.query.view === "config") return ok(res, { enabled: false, captureContent: false, sampleRate: 0 });
  if (req.query.view === "logs") return ok(res, { logs: [] });
  const traces = world.seed.traces || [];
  if (req.query.id) { const t = traces.find(x => x.trace.traceId === req.query.id); return t ? ok(res, t) : ok(res, { error: "trace not found" }, 404); }
  ok(res, { traces: traces.map(t => t.trace) });
});
app.get(["/healthz", "/api/healthz"], (_q, res) => ok(res, { ok: true }));

const PORT = Number(process.env.PORT) || 4173;
app.listen(PORT, () => console.log(`Mini Muse test server at http://localhost:${PORT}`));
