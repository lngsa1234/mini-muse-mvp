/*
 * The real Muse, for evals: the system prompt and tools a turn actually gets
 * (server/agent/prompt.js, server/agent/tools/), and one model call through the
 * agent's own LLM client (server/agent/llm.js). A prompt, guidance or tool change
 * is exactly what the evals see; nothing here is a copy.
 *
 * Each case starts a fresh conversation: no memory, ideas or goals, Google
 * connected (so Gmail and Calendar tools are offered, as for a connected user)
 * unless the case sets context: { google: false }. The clock is fixed so the
 * prompt is the same on every run.
 */
import { instructions } from "../server/agent/prompt.js";
import { activeTools } from "../server/agent/tools/index.js";
import { toApiTools } from "../server/agent/loop.js";

export const EVAL_NOW = new Date("2026-11-23T15:00:00Z");

export function museContext(testCase = {}) {
  return {
    data: { memory: [], connectors: {}, prefs: {} },
    googleConnected: testCase.context?.google !== false,
    tz: "UTC",
    now: () => EVAL_NOW
  };
}

// The request Muse would send for this case's message: { system, tools, body }.
export function museRequest(testCase, { tier = "quick" } = {}) {
  const ctx = museContext(testCase);
  const system = instructions(ctx, [], []);
  const tools = toApiTools(activeTools(ctx));
  const body = {
    tier,
    messages: [{ role: "system", content: system }, { role: "user", content: testCase.user }],
    tools,
    ...(testCase.toolChoice ? { tool_choice: testCase.toolChoice } : {})
  };
  return { system, tools, body };
}

// One model turn. Returns { text, calls: [{ name, input }] } — the tools Muse asked for
// (they aren't run: each case checks Muse's first choice).
export async function askMuse(llm, testCase, options) {
  const { body } = museRequest(testCase, options);
  const turn = await llm.chat(body);
  return { text: turn.text || "", calls: turn.toolUses.map(use => ({ name: use.name, input: use.input || {} })) };
}
