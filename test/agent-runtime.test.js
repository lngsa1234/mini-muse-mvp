// Server-side agent runtime (ADR-0009) with a scripted fake model and in-memory
// store/repo: no network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn, answerWait, cancelTurn } from "../server/agent/runtime.js";
import { makeMemoryStore } from "../server/agent/memory-store.js";
import { makeMemoryRepo } from "../server/agent/repo.js";
import { readStream } from "../server/agent/llm.js";
import { handleImport, handlePatchState, handleGetState } from "../server/state.js";
import { dispatchAgent } from "../server/agent/http.js";

const U = "u1";
const call = (name, input, id = "c_" + name) => ({ id, name, input });

// A fake model: each entry is { text } or { tools: [call(...)] }, consumed in order.
function fakeLlm(script, seen = []) {
  let i = 0;
  return {
    seen,
    async chat(body, { onText } = {}) {
      seen.push(JSON.parse(JSON.stringify(body)));
      const s = script[i++] || { text: "(no more script)" };
      if (s.tools) return { text: "", toolUses: s.tools, stopReason: "tool_calls", assistantMessage: { role: "assistant", content: null, tool_calls: s.tools.map(t => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.input) } })) } };
      onText?.(s.text);
      return { text: s.text, toolUses: [], stopReason: "stop", assistantMessage: { role: "assistant", content: s.text } };
    },
    async json() { return { scores: { role: 5, seniority: 4, skills: 4, domain: 3, logistics: 3 }, keywords: [], dealbreakers: [] }; }
  };
}

function setup({ script = [], repoSeed = {}, google, ...extra } = {}) {
  const store = makeMemoryStore(), repo = makeMemoryRepo(repoSeed), llm = fakeLlm(script);
  const events = [];
  const deps = { store, repo, llm, env: {}, googleConnected: !!google, services: { google: google || (async () => { throw new Error("no google"); }) }, timeouts: { approval: 2000, clientTool: 2000, poll: 20, pageLoad: 0 }, ...extra };
  const emit = (name, data) => events.push([name, data]);
  return { store, repo, llm, deps, events, emit, turn: (input, more = {}) => runTurn({ userId: U, input: { tz: "America/Detroit", ...input }, deps: { ...deps, ...more }, emit }) };
}

const waitForEvent = async (events, name, n = 1) => {
  for (let i = 0; i < 200; i++) { const hits = events.filter(e => e[0] === name); if (hits.length >= n) return hits[n - 1][1]; await new Promise(r => setTimeout(r, 10)); }
  throw new Error("no event " + name);
};

test("a turn saves both messages on the server, so every device sees them", async () => {
  const t = setup({ script: [{ text: "Hi Ling!" }] });
  const msg = await t.turn({ text: "hello" });
  assert.equal(msg.text, "Hi Ling!");
  assert.equal(msg.live, false);
  const chat = await t.store.listChat(U);
  assert.deepEqual(chat.map(m => [m.role, m.text]), [["user", "hello"], ["assistant", "Hi Ling!"]]);
  assert.ok(t.events.some(([n]) => n === "done"));
  // The system prompt is built on the server, in the user's time zone.
  assert.match(t.llm.seen[0].messages[0].content, /America\/Detroit/);
});

test("remember writes memory to the server, and the next turn's prompt includes it", async () => {
  const t = setup({ script: [{ tools: [call("remember", { fact: "I'm vegetarian" })] }, { text: "Noted." }, { text: "Sure." }] });
  await t.turn({ text: "I'm vegetarian. Remember that." });
  const state = await t.store.getState(U);
  assert.deepEqual(state.memory.map(f => f.fact), ["I'm vegetarian"]);
  assert.ok(t.events.some(([n, d]) => n === "data" && d.memory));
  assert.equal(state.audit[0].tool, "remember");
  await t.turn({ text: "What should I cook?" });
  const prompt = t.llm.seen[2].messages[0].content;
  assert.match(prompt, /- I'm vegetarian/);
  // History from the first turn is sent too.
  assert.ok(t.llm.seen[2].messages.some(m => m.role === "user" && /Remember that/.test(m.content)));
});

test("update_step's evidence rule is enforced on the server", async () => {
  const goal = { id: "g1", goal: "Land 3 interviews", steps: [{ text: "Research companies hiring PMs", status: "todo" }], applications: [] };
  const t = setup({ repoSeed: { goals: [goal] }, script: [{ tools: [call("update_step", { goal_id: "g1", step: 1, status: "done", evidence: "web_search" })] }, { text: "ok" }] });
  await t.turn({ text: "mark it" });
  const toolMsg = t.llm.seen[1].messages.find(m => m.role === "tool");
  assert.match(toolMsg.content, /^Error: Cannot mark .* no tool did any work this turn/);
  assert.equal(t.repo.data.goals[0].steps[0].status, "todo");
});

test("an approval waits for the user's answer, which can come from any device", async () => {
  const sent = [];
  const google = async (action, body) => { if (action === "mail/send") { sent.push(body); return { id: "x1" }; } return {}; };
  const t = setup({ google, script: [{ tools: [call("mail_send", { to: "maya@example.com", subject: "Hi", body: "See you" })] }, { text: "Sent!" }] });
  const running = t.turn({ text: "email maya" });
  const msg = await waitForEvent(t.events, "msg", 3);
  const card = msg.acts.find(a => a.approval === "pending");
  assert.ok(card, "approval card shown");
  // The pending card is saved, so another device can render and answer it.
  const saved = (await t.store.listChat(U)).find(m => m.id === msg.id);
  assert.equal(saved.acts.find(a => a.id === card.id).approval, "pending");
  assert.equal(await answerWait(t.store, U, card.id, { answer: true }), true);
  const done = await running;
  assert.equal(sent.length, 1);
  assert.equal(done.acts.find(a => a.id === card.id).approval, "approved");
  assert.equal(done.text, "Sent!");
  // Answering again is too late.
  assert.equal(await answerWait(t.store, U, card.id, { answer: false }), false);
});

test("an unanswered approval expires and nothing is sent", async () => {
  const sent = [];
  const t = setup({ google: async (a, b) => { sent.push(b); return { id: "x" }; }, script: [{ tools: [call("mail_send", { to: "a@b.c", subject: "S", body: "B" })] }, { text: "Okay, not sent." }] });
  t.deps.timeouts.approval = 60;
  const done = await t.turn({ text: "email" });
  assert.equal(sent.length, 0);
  assert.equal(done.acts[0].approval, "expired");
  assert.match(t.llm.seen[1].messages.find(m => m.role === "tool").content, /did not answer/);
});

test("browser bridge tools are relayed to the open tab", async () => {
  const t = setup({ script: [{ tools: [call("browser_snapshot", {})] }, { text: "I see the page." }] });
  const running = t.turn({ text: "what's on the page" });
  const req = await waitForEvent(t.events, "client_tool");
  assert.equal(req.name, "browser_snapshot");
  await answerWait(t.store, U, req.waitId, { result: { title: "Apply", url: "https://x.test", text: "Form" } });
  const done = await running;
  assert.equal(done.text, "I see the page.");
  assert.match(t.llm.seen[1].messages.find(m => m.role === "tool").content, /"title":"Apply"/);
});

test("a browser tool fails cleanly when the tab doesn't answer", async () => {
  const t = setup({ script: [{ tools: [call("browser_fields", {})] }, { text: "No bridge." }] });
  t.deps.timeouts.clientTool = 50;
  await t.turn({ text: "fill the form" });
  assert.match(t.llm.seen[1].messages.find(m => m.role === "tool").content, /^Error: The Mini Muse tab .* didn't run the browser tool/);
});

test("only one turn runs at a time per user, across devices", async () => {
  const t = setup({ script: [{ tools: [call("mail_send", { to: "a@b.c", subject: "S", body: "B" })] }, { text: "done" }], google: async () => ({ id: "x" }) });
  const first = t.turn({ text: "email" });
  const msg = await waitForEvent(t.events, "msg", 3);
  const second = setup(); second.deps.store = t.store;
  await runTurn({ userId: U, input: { text: "another" }, deps: { ...second.deps, store: t.store }, emit: second.emit });
  assert.deepEqual(second.events.find(e => e[0] === "error")[1].code, "busy");
  await cancelTurn(t.store, U, msg.id);
  const done = await first;
  assert.equal(done.live, false);
  assert.ok(!done.error, "a cancelled turn shows no error");
});

test("job research pre-step tells the model to search now", async () => {
  const goal = { id: "g1", goal: "Land 3 interviews", steps: [{ text: "Find openings at companies hiring PMs", status: "todo" }], applications: [] };
  const t = setup({ repoSeed: { goals: [goal] }, script: [{ text: "Searching…" }] });
  await t.turn({ text: "move my goal forward" });
  const last = t.llm.seen[0].messages.at(-1);
  assert.match(last.content, /call jobs_search/);
});

test("web tools follow the Settings → Web search preference", async () => {
  const t = setup({ script: [{ text: "a" }, { text: "b" }] });
  await t.turn({ text: "x" });
  assert.ok(t.llm.seen[0].tools.some(x => x.function.name === "web_search"));
  await t.store.patchState(U, { prefs: { webSearch: false } });
  await t.turn({ text: "y" });
  assert.ok(!t.llm.seen[1].tools.some(x => x.function.name === "web_search"));
  // Gmail tools only when Google is connected.
  assert.ok(!t.llm.seen[1].tools.some(x => x.function.name === "mail_send"));
});

test("SSE parser assembles text and streamed tool calls", async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo","tool_calls":[{"index":0,"id":"c1","function":{"name":"remember","arguments":"{\\"fa"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ct\\":\\"x\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
    "data: [DONE]\n\n"
  ];
  async function* body() { for (const c of chunks) yield new TextEncoder().encode(c); }
  const out = await readStream(body());
  assert.equal(out.text, "Hello");
  assert.equal(out.stopReason, "tool_calls");
  assert.deepEqual(out.toolUses, [{ id: "c1", name: "remember", input: { fact: "x" } }]);
});

test("state: PATCH merges keys; chat and docs can't be written through it", async () => {
  const store = makeMemoryStore();
  await handlePatchState(store, U, { prefs: { mode: "default" }, chat: [{ id: "x" }], docs: [] });
  await handlePatchState(store, U, { memory: [{ id: "1", fact: "a" }] });
  const { json } = await handleGetState(store, U);
  assert.deepEqual(Object.keys(json.state).sort(), ["memory", "prefs"]);
  assert.deepEqual(json.chat, []);
});

test("state: an old browser's localStorage is imported only into an empty account", async () => {
  const store = makeMemoryStore();
  const first = await handleImport(store, U, { state: { memory: [{ id: "1", fact: "laptop fact" }], audit: [{ t: 1, tool: "x" }] }, chat: [{ id: "m1", role: "user", text: "from laptop", t: 5 }] });
  assert.equal(first.json.imported, true);
  const second = await handleImport(store, U, { state: { memory: [{ id: "2", fact: "desktop fact" }] }, chat: [] });
  assert.equal(second.json.imported, false);
  const { json } = await handleGetState(store, U);
  assert.deepEqual(json.state.memory.map(f => f.fact), ["laptop fact"]);
  assert.equal(json.chat[0].text, "from laptop");
});

test("agent API: answer validates, tools lists every tool", async () => {
  const store = makeMemoryStore();
  assert.equal((await dispatchAgent(store, { method: "POST", action: "answer", userId: U, body: {} })).status, 400);
  assert.equal((await dispatchAgent(store, { method: "POST", action: "answer", userId: U, body: { waitId: "nope", answer: true } })).status, 409);
  const { json } = await dispatchAgent(store, { method: "GET", action: "tools", userId: U });
  const names = json.tools.map(t => t.name);
  for (const n of ["create_goal", "remember", "docs_search", "web_search", "browser_click", "score_fit", "mail_send", "contacts_add"]) assert.ok(names.includes(n), n);
});
