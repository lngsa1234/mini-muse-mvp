// Shared harness for acceptance tests: a scripted fake model plus in-memory
// store and repo, so a whole agent turn runs with no network and no database.
// Lives outside test/ so the test runner doesn't run it as a test file.
import { runTurn } from "../server/agent/runtime.js";
import { makeMemoryStore } from "../server/agent/memory-store.js";
import { makeMemoryRepo } from "../server/agent/repo.js";

export const U = "u1";
export const call = (name, input, id = "c_" + name) => ({ id, name, input });

// Each script entry is { text, stop? } or { tools: [call(...)] }, used in order.
export function fakeLlm(script, seen = []) {
  let i = 0;
  return {
    seen,
    async chat(body, { onText } = {}) {
      seen.push(JSON.parse(JSON.stringify(body)));
      const s = script[i++] || { text: "(no more script)" };
      if (s.tools) return { text: "", toolUses: s.tools, stopReason: "tool_calls", assistantMessage: { role: "assistant", content: null, tool_calls: s.tools.map(t => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.input) } })) } };
      onText?.(s.text);
      return { text: s.text, toolUses: [], stopReason: s.stop || "stop", assistantMessage: { role: "assistant", content: s.text } };
    },
    async json() { return {}; }
  };
}

export function setup({ script = [], repoSeed = {}, google, ...extra } = {}) {
  const store = makeMemoryStore(), repo = makeMemoryRepo(repoSeed), llm = fakeLlm(script);
  const events = [];
  const deps = { store, repo, llm, env: {}, googleConnected: !!google, services: { google: google || (async () => { throw new Error("no google"); }) }, timeouts: { approval: 2000, clientTool: 2000, poll: 20, pageLoad: 0 }, ...extra };
  const emit = (name, data) => events.push([name, data]);
  return { store, repo, llm, deps, events, emit, turn: (input, more = {}) => runTurn({ userId: U, input: { tz: "America/Detroit", ...input }, deps: { ...deps, ...more }, emit }) };
}

export async function waitForEvent(events, name, n = 1) {
  for (let i = 0; i < 200; i++) {
    const hits = events.filter(e => e[0] === name);
    if (hits.length >= n) return hits[n - 1][1];
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error("no event " + name);
}

export const toolReply = (llm, step = 1) => llm.seen[step].messages.filter(m => m.role === "tool").at(-1)?.content;
